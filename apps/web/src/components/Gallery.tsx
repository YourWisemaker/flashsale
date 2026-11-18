import { useState } from "react";
import type { Product } from "../api.js";

export function Gallery({ images }: { images: Product["images"] }) {
  const [selected, setSelected] = useState(0);
  const main = images[selected];
  if (!main) return null;

  return (
    <div className="gallery">
      <div className="gallery__main">
        <img src={main.url} alt={main.alt} width={800} height={800} />
      </div>
      {images.length > 1 && (
        <div className="gallery__thumbs" role="group" aria-label="Product photos">
          {images.map((image, index) => (
            <button
              key={image.url}
              type="button"
              className="gallery__thumb"
              aria-pressed={index === selected}
              aria-label={`Show photo ${index + 1}: ${image.alt}`}
              onClick={() => setSelected(index)}
            >
              <img src={image.url} alt="" width={80} height={80} loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
