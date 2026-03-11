import sys
import urllib.request
import os

try:
    from PIL import Image
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow"])
    from PIL import Image

def process_image():
    # Paths
    img_emblem_path = r"C:\Users\yousef amr\.gemini\antigravity\brain\6b39eaa4-d324-4ec2-94de-4213c4af8cbd\media__1773231766797.jpg"
    img_text_path = r"C:\Users\yousef amr\.gemini\antigravity\brain\6b39eaa4-d324-4ec2-94de-4213c4af8cbd\media__1773231617793.png"
    
    out_emblem = r"e:\Roya\client\images\brand-symbol.png"
    out_text = r"e:\Roya\client\images\brand-text.png"

    # 1. Process Text Logo
    text_img = Image.open(img_text_path).convert("RGBA")
    # Quick auto-crop
    text_bbox = text_img.getbbox()
    if text_bbox:
        text_img = text_img.crop(text_bbox)
    text_img.save(out_text)
    print(f"Saved text to {out_text}, size: {text_img.size}")

    # 2. Process Emblem Logo
    emblem_img = Image.open(img_emblem_path).convert("RGBA")
    width, height = emblem_img.size
    print(f"Original emblem size: {width}x{height}")
    
    # The image has text at the bottom. The text usually starts around 75% down.
    # We will crop the top 78% of the image.
    crop_h = int(height * 0.77)
    emblem_cropped = emblem_img.crop((0, 0, width, crop_h))
    
    # Remove black background by converting luminance to alpha
    # Since it's gold on black, we can extract the alpha by taking max(R, G, B) mapping
    # Actually, a better way to not lose the gold color:
    # alpha = max(R,G,B). If alpha == 0, then transparent.
    # R = R_old / (alpha/255) to restore original color intensity without black mixed in.
    
    data = emblem_cropped.getdata()
    new_data = []
    
    for r, g, b, a in data:
        # Calculate luma
        luma = max(r, g, b)
        
        # Soft threshold to remove pure black completely
        if luma < 10:
            new_data.append((0, 0, 0, 0))
        else:
            # We want to keep the exact gold color.
            # The black background makes the edges antialiased with black.
            # We can use luma as the alpha mask to make black turn into transparency.
            alpha = luma
            # Boost the color to remove the black darkness from the edge pixels
            nr = min(255, int(r * 255 / alpha)) if alpha > 0 else 0
            ng = min(255, int(g * 255 / alpha)) if alpha > 0 else 0
            nb = min(255, int(b * 255 / alpha)) if alpha > 0 else 0
            
            # Additional tweak: The graphic is highly saturated gold, so boost saturation slightly
            new_data.append((nr, ng, nb, alpha))

    emblem_cropped.putdata(new_data)
    
    # Auto-crop empty transparent space
    bbox = emblem_cropped.getbbox()
    if bbox:
        emblem_cropped = emblem_cropped.crop(bbox)
        
    emblem_cropped.save(out_emblem)
    print(f"Saved emblem to {out_emblem}, size: {emblem_cropped.size}")

if __name__ == "__main__":
    process_image()
