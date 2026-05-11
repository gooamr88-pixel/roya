const fs = require('fs');
const path = require('path');

function processDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        if (file === 'node_modules' || file === 'logs' || file.endsWith('.svg') || file.endsWith('.png') || file.endsWith('.jpg') || file === 'i18n.js') continue;
        
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            processDir(fullPath);
        } else {
            if (['.js', '.json', '.njk', '.html'].includes(path.extname(fullPath))) {
                let content = fs.readFileSync(fullPath, 'utf8');
                let newContent = content;
                
                // Case sensitive replacement for English
                newContent = newContent.replace(/\bNabda\b(?!\s+Capital\s+Group)/g, 'Nabda Capital Group');
                newContent = newContent.replace(/\bNABDA\b(?!\s+CAPITAL\s+GROUP)/g, 'NABDA CAPITAL GROUP');
                
                // Replace Arabic
                newContent = newContent.replace(/نبضة(?!\s+كابيتال\s+جروب)/g, 'نبضة كابيتال جروب');
                
                if (content !== newContent) {
                    fs.writeFileSync(fullPath, newContent, 'utf8');
                    console.log('Updated', fullPath);
                }
            }
        }
    }
}

processDir('e:\\Roya\\server');
processDir('e:\\Roya\\client');
console.log('Done.');
