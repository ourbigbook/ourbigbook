import React from 'react'
import { defaultProfileImage } from 'front/config'

const handleBrokenImage = (image: HTMLImageElement) => {
  if (image.getAttribute('src') !== defaultProfileImage) {
    image.src = defaultProfileImage;
  }
};

interface CustomImageProps {
  alt?: string;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLImageElement>;
  imgRef?: React.Ref<HTMLImageElement>;
  src: string;
}

const CustomImage = ({
  alt,
  className,
  onClick,
  imgRef,
  src,
}: CustomImageProps) => {
  const imageRef = React.useRef<HTMLImageElement>(null)
  React.useImperativeHandle(imgRef, () => imageRef.current)
  React.useEffect(() => {
    const image = imageRef.current
    // Server-rendered images can fail before hydration attaches onError.
    if (image.complete && image.naturalWidth === 0) {
      handleBrokenImage(image)
    }
  }, [src])
  return <img {...{
    alt,
    className,
    onClick,
    onError: e => handleBrokenImage(e.currentTarget),
    ref: imageRef,
    src,
  }} />
}

export default CustomImage;
