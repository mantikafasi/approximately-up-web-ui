"""Extract local globe maps from Approximately Up's terrain and palette assets.

Requires: python -m pip install UnityPy numpy pillow
Run: python tools/export-surfaces.py "G:/SteamLibrary/steamapps/common/Approximately Up"
The local atlas loads local-textures/*-surface.png automatically. Keep them private.

Uses shipped height/biome cubefaces, PlanetTerrainBiom colour textures, and ocean
colours. Resampling and lighting approximate the native renderer; runtime terrain
modifiers, biome-edge noise, clouds and water shaders are not reproduced.
"""
import argparse
import struct
from pathlib import Path

import numpy as np
import UnityPy
from PIL import Image
from UnityPy.classes import PPtr


def pointer(owner, raw, offset):
    file_id, path_id = struct.unpack_from('<iq', raw, offset)
    if not path_id:
        raise ValueError('Missing native asset reference')
    result = PPtr(m_FileID=file_id, m_PathID=path_id, assetsfile=owner.assets_file).deref()
    if result is None:
        raise ValueError(f'Unresolved native asset reference {file_id}:{path_id}')
    return result


def planet_setups(game_data):
    environment = UnityPy.load(str(game_data / 'level0'))
    setups = {}
    for obj in environment.objects:
        if obj.type.name != 'GameObject':
            continue
        go = obj.read()
        if not (game_data / 'StreamingAssets' / 'UniverseSpheroids' / f'{go.m_Name}_0.dat').is_file():
            continue
        planet = None
        ocean = None
        for component in go.m_Component:
            part = component.component.deref()
            if part.type.name != 'MonoBehaviour':
                continue
            head = part.parse_monobehaviour_head()
            script = head.m_Script.deref().read().m_ClassName
            if script == 'Planet':
                planet = part
            elif script == 'PlanetOcean' and head.m_Enabled:
                ocean = part
        if planet is None:
            continue
        # Supported game serialization: MonoBehaviour header ends at byte 32;
        # UniverseSpheroid/Planet fields precede the palette array at byte 128.
        raw = planet.get_raw_data()
        count = struct.unpack_from('<i', raw, 128)[0]
        if count < 1 or count > 16 or len(raw) < 132 + count * 12:
            raise ValueError(f'Unsupported Planet palette layout: {go.m_Name}')
        palettes = []
        for index in range(count):
            biom = pointer(planet, raw, 132 + index * 12)
            if biom.parse_monobehaviour_head().m_Script.deref().read().m_ClassName != 'PlanetTerrainBiom':
                raise ValueError(f'Invalid biome palette reference for {go.m_Name}')
            payload = biom.get_raw_data()
            name_length = struct.unpack_from('<i', payload, 28)[0]
            texture_offset = (32 + name_length + 3) & ~3
            texture = pointer(biom, payload, texture_offset).read()
            if texture.m_Width != 16 or texture.m_Height != 16:
                raise ValueError(f'Unexpected native palette dimensions for {go.m_Name}')
            # Unity GetPixel rows start at the bottom; UnityPy images start at the top.
            palettes.append(np.asarray(texture.image.convert('RGB'))[::-1].copy())
        water = None
        if ocean is not None:
            payload = ocean.get_raw_data()
            # includeInMiniature controls the native globe preview's ocean visibility.
            if payload[32]:
                water = (np.array(struct.unpack_from('<3f', payload, 36)),
                         np.array(struct.unpack_from('<3f', payload, 52)))
        setups[go.m_Name] = (np.stack(palettes), water)
    if len(setups) != 15:
        raise ValueError(f'Expected 15 planet palettes, found {len(setups)}')
    return setups


def inverse_cube_pair(a, b):
    """Inverse of the game's spherified-cube projection for two minor axes."""
    difference = 2 * (a * a - b * b)
    squared = (3 + difference - np.sqrt(np.maximum(0, (3 + difference) ** 2 - 24 * a * a))) / 2
    return np.copysign(np.sqrt(np.maximum(0, squared)), a), np.copysign(np.sqrt(np.maximum(0, squared - difference)), b)


def cube_coordinates(x, y, z):
    axis = np.argmax(np.stack((np.abs(x), np.abs(y), np.abs(z))), axis=0)
    face = np.where(axis == 0, np.where(x >= 0, 0, 1),
                    np.where(axis == 1, np.where(y >= 0, 2, 3), np.where(z >= 0, 4, 5)))
    minor_a = np.where(axis == 0, y, x)
    minor_b = np.where(axis == 2, y, z)
    a, b = inverse_cube_pair(minor_a, minor_b)
    cx = np.where(axis == 0, np.sign(x), a)
    cy = np.where(axis == 1, np.sign(y), np.where(axis == 0, a, b))
    cz = np.where(axis == 2, np.sign(z), b)
    u = np.where(axis == 0, np.where(x >= 0, -cz, cz), np.where(axis == 1, cx, np.where(z >= 0, cx, -cx)))
    v = np.where(axis == 1, np.where(y >= 0, cz, -cz), -cy)
    return face, (u + 1) / 2, (v + 1) / 2


def cube_samples(coordinates, data):
    face, u, v = coordinates
    size = data.shape[1]
    col = np.clip((u * size).astype(np.int32), 0, size - 1)
    row = np.clip((v * size).astype(np.int32), 0, size - 1)
    return data[face, row, col]


def export(game_data, output, width):
    source = game_data / 'StreamingAssets' / 'UniverseSpheroids'
    height = width // 2
    longitude = (np.arange(width) + 0.5) * (2 * np.pi / width) - np.pi
    latitude = np.pi / 2 - (np.arange(height) + 0.5) * (np.pi / height)
    x = np.cos(latitude[:, None]) * np.cos(longitude)[None, :]
    y = np.broadcast_to(np.sin(latitude[:, None]), (height, width))
    z = np.cos(latitude[:, None]) * np.sin(longitude)[None, :]
    coordinates = cube_coordinates(x, y, z)
    output.mkdir(parents=True, exist_ok=True)
    for name, (palettes, water) in planet_setups(game_data).items():
        biome_path = source / f'{name}_1.dat'
        height_path = source / f'{name}_0.dat'
        biome_size = round((biome_path.stat().st_size / 6) ** 0.5)
        height_size = round((height_path.stat().st_size / 12) ** 0.5)
        if biome_size * biome_size * 6 != biome_path.stat().st_size or height_size * height_size * 12 != height_path.stat().st_size:
            raise ValueError(f'Unexpected cubemap dimensions for {name}')
        biomes = np.memmap(biome_path, dtype=np.uint8, mode='r', shape=(6, biome_size, biome_size))
        elevation = np.memmap(height_path, dtype='<u2', mode='r', shape=(6, height_size, height_size))
        biome = cube_samples(coordinates, biomes)
        if np.max(biome) >= len(palettes):
            raise ValueError(f'Unmapped native biome index for {name}')
        # Native HeightData.GetHeight: 0.96 + ushort * 0.04 / 32767.5.
        ground = 0.96 + cube_samples(coordinates, elevation).astype(np.float32) * (0.04 / 32767.5)
        dy, dx = np.gradient(ground)
        gradient = np.hypot(dy / (np.pi / height), dx / ((2 * np.pi / width) * np.cos(latitude[:, None])))
        slope = np.minimum(15, (np.arctan(gradient / ground) * (2 / np.pi) * 16).astype(np.int32))
        # The native renderer chooses one of 16 palette columns by position hash.
        # A deterministic pixel hash substitutes for its world-space vertex hash.
        xx, yy = np.meshgrid(np.arange(width, dtype=np.uint32), np.arange(height, dtype=np.uint32))
        variation = ((xx * np.uint32(0x5F356491)) ^ (yy * np.uint32(0xE336BEB9))) >> 28
        colours = palettes[biome, slope, variation].astype(np.float32)
        if water is not None:
            deep, shallow = water
            depth = np.maximum(0, 1 - ground)
            blend = np.clip(depth / 0.003, 0, 1)[..., None]
            linear = np.clip(shallow * (1 - blend) + deep * blend, 0, 1)
            ocean = np.where(linear <= 0.0031308, linear * 12.92, 1.055 * linear ** (1 / 2.4) - 0.055) * 255
            colours = np.where((ground < 1)[..., None], ocean, colours)
        target = output / (name.lower().replace(' ', '') + '-surface.png')
        Image.fromarray(np.uint8(np.clip(colours, 0, 255))).save(target, optimize=True)
        print(f'{name}: real {len(palettes)}-biome palette, {biome_size}² mask, {height_size}² heights → {target}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('game', type=Path, help='Approximately Up installation directory')
    parser.add_argument('--output', type=Path, default=Path('local-textures'))
    parser.add_argument('--width', type=int, default=1024)
    args = parser.parse_args()
    if args.width < 256 or args.width > 4096 or args.width % 2:
        parser.error('--width must be an even integer from 256 through 4096')
    game_data = args.game / 'ApproximatelyUp_Data'
    if not (game_data / 'level0').is_file():
        parser.error(f'Game scene asset not found: {game_data / "level0"}')
    export(game_data, args.output, args.width)
