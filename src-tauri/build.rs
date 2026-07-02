use std::env;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

fn main() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR missing"));
    let source_icon = manifest_dir.join("..").join("docs").join("icon.png");
    let out_dir = manifest_dir.join("icons").join("generated");

    fs::create_dir_all(&out_dir).expect("failed to create generated icon dir");
    generate_icons(&source_icon, &out_dir).expect("failed to generate app icons");

    tauri_build::build();
}

fn generate_icons(source: &Path, out_dir: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let img = image::open(source)?.to_rgba8();
    let sizes = [32_u32, 128, 256, 512];

    for size in sizes {
        let resized = image::imageops::resize(&img, size, size, image::imageops::FilterType::Lanczos3);
        write_if_changed(out_dir.join(format!("{size}x{size}.png")), &resized.into_raw(), size, size)?;
    }

    let ico_sizes = [16_u32, 32, 48, 64, 128, 256];
    let mut icon_dir = ico::IconDir::new(ico::ResourceType::Icon);
    for size in ico_sizes {
        let resized = image::imageops::resize(&img, size, size, image::imageops::FilterType::Lanczos3);
        let entry = ico::IconDirEntry::encode(&ico::IconImage::from_rgba_data(
            size,
            size,
            resized.into_raw(),
        ))?;
        icon_dir.add_entry(entry);
    }

    let mut ico_bytes = Vec::new();
    icon_dir.write(&mut ico_bytes)?;
    write_if_changed_bytes(out_dir.join("icon.ico"), &ico_bytes)?;

    Ok(())
}

fn write_if_changed(path: PathBuf, rgba: &[u8], width: u32, height: u32) -> Result<(), Box<dyn std::error::Error>> {
    let image = image::RgbaImage::from_raw(width, height, rgba.to_vec())
        .ok_or_else(|| format!("invalid RGBA buffer for {width}x{height}"))?;
    let dyn_img = image::DynamicImage::ImageRgba8(image);
    let mut bytes = Vec::new();
    dyn_img.write_to(&mut std::io::Cursor::new(&mut bytes), image::ImageFormat::Png)?;
    write_if_changed_bytes(path, &bytes)
}

fn write_if_changed_bytes(path: PathBuf, bytes: &[u8]) -> Result<(), Box<dyn std::error::Error>> {
    if let Ok(existing) = fs::read(&path) {
        if existing == bytes {
            return Ok(());
        }
    }

    let mut file = fs::File::create(path)?;
    file.write_all(bytes)?;
    Ok(())
}
