const sharp = require('sharp');
const fs = require('fs');

async function analyzeLogo() {
    const inputPath = 'C:\\Users\\yousef amr\\.gemini\\antigravity\\brain\\1dc5a283-2ee8-499c-ae28-44a9a7645770\\media__1778511283637.jpg';
    
    try {
        const { data, info } = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        
        // Find bounding boxes for connected components or just horizontal slices with content
        let slices = [];
        let inContent = false;
        let currentSlice = null;
        
        for (let y = 0; y < info.height; y++) {
            let rowHasContent = false;
            for (let x = 0; x < info.width; x++) {
                const idx = (y * info.width + x) * 4;
                const r = data[idx];
                const g = data[idx+1];
                const b = data[idx+2];
                // Non-white pixel
                if (r < 240 || g < 240 || b < 240) {
                    rowHasContent = true;
                    break;
                }
            }
            
            if (rowHasContent && !inContent) {
                inContent = true;
                currentSlice = { startY: y };
            } else if (!rowHasContent && inContent) {
                inContent = false;
                currentSlice.endY = y;
                slices.push(currentSlice);
            }
        }
        
        if (inContent) {
            currentSlice.endY = info.height;
            slices.push(currentSlice);
        }
        
        console.log('Image dimensions:', info.width, 'x', info.height);
        console.log('Content slices (Y coords):');
        slices.forEach((slice, i) => {
            console.log(`Slice ${i + 1}: Y=${slice.startY} to Y=${slice.endY} (height=${slice.endY - slice.startY})`);
        });
        
    } catch (err) {
        console.error(err);
    }
}

analyzeLogo();
