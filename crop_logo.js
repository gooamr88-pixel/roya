const sharp = require('sharp');

async function processLogo() {
    const inputPath = 'C:\\Users\\yousef amr\\.gemini\\antigravity\\brain\\1dc5a283-2ee8-499c-ae28-44a9a7645770\\media__1778511283637.jpg';
    const outputPath = 'e:\\Roya\\client\\images\\nabda-new-logo.png';
    const outputPathLight = 'e:\\Roya\\client\\images\\nabda-new-logo-light.png';
    
    try {
        const image = sharp(inputPath);
        const metadata = await image.metadata();
        
        // Extract ONLY the symbol (Slice 1 ends at Y=543, we'll cut at 580)
        const cropHeight = 580;
        
        const { data, info } = await sharp(inputPath)
            .extract({ left: 0, top: 0, width: metadata.width, height: cropHeight })
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
            
        // Buffer for light mode
        const dataLight = Buffer.from(data);
        
        // Make near-white pixels transparent for the DARK text version (light mode background)
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i+1];
            const b = data[i+2];
            
            if (r > 230 && g > 230 && b > 230) {
                data[i+3] = 0; 
                dataLight[i+3] = 0;
            }
            else if (r > 200 && g > 200 && b > 200) {
                const avg = (r + g + b) / 3;
                const alpha = Math.max(0, 255 - ((avg - 200) * 4));
                data[i+3] = alpha;
                dataLight[i+3] = alpha;
            }
            
            // For the light logo (dark mode background), invert black to white
            if (dataLight[i+3] > 0 && r < 50 && g < 50 && b < 50) {
                dataLight[i] = 255;
                dataLight[i+1] = 255;
                dataLight[i+2] = 255;
            } else if (dataLight[i+3] > 0 && r < 100 && g < 100 && b < 100 && Math.abs(r-g) < 15 && Math.abs(g-b) < 15) {
                dataLight[i] = 255;
                dataLight[i+1] = 255;
                dataLight[i+2] = 255;
            }
        }
        
        await sharp(data, {
            raw: {
                width: info.width,
                height: info.height,
                channels: 4
            }
        })
        .trim()
        .png()
        .toFile(outputPath);
        
        await sharp(dataLight, {
            raw: {
                width: info.width,
                height: info.height,
                channels: 4
            }
        })
        .trim()
        .png()
        .toFile(outputPathLight);
        
        console.log('Successfully extracted ONLY the symbol and created both versions!');
    } catch (err) {
        console.error('Error:', err);
    }
}

processLogo();
