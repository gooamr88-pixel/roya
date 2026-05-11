const sharp = require('sharp');

async function invertBlackToWhite() {
    const inputPath = 'e:\\Roya\\client\\images\\nabda-new-logo.png';
    const outputPath = 'e:\\Roya\\client\\images\\nabda-new-logo-light.png';
    
    try {
        const image = sharp(inputPath);
        const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
            
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i+1];
            const b = data[i+2];
            const a = data[i+3];
            
            // If pixel is mostly black/very dark
            if (a > 0 && r < 50 && g < 50 && b < 50) {
                // To keep anti-aliasing smooth, we can interpolate based on how dark it is
                // but setting strictly to white is fine for pure black parts.
                data[i] = 255;
                data[i+1] = 255;
                data[i+2] = 255;
            }
            // Handling anti-aliased dark edges:
            else if (a > 0 && r < 100 && g < 100 && b < 100 && Math.abs(r-g) < 15 && Math.abs(g-b) < 15) {
                data[i] = 255;
                data[i+1] = 255;
                data[i+2] = 255;
                // keep the original alpha to keep edges smooth
            }
        }
        
        await sharp(data, {
            raw: {
                width: info.width,
                height: info.height,
                channels: 4
            }
        })
        .png()
        .toFile(outputPath);
        
        console.log('Light logo created!');
    } catch (err) {
        console.error('Error:', err);
    }
}

invertBlackToWhite();
