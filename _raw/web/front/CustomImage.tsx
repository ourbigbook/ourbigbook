import React from 'react'
import { defaultProfileImage } from 'front/config'

const handleBrokenImage = e => {
  e.target.src = defaultProfileImage;
  e.target.onerror = null;
};

interface CustomImageProps {
  alt?: string;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLImageElement>;
  imgRef?: React.LegacyRef<HTMLImageElement>;
  src: string;
}

const CustomImage = ({
  alt,
  className,
  onClick,
  imgRef,
  src,
}: CustomImageProps) => {
  return <img {...{
    alt,
    className,
    onClick,
    onError: handleBrokenImage,
    ref: imgRef,
    src,
  }} />
}

export default CustomImage;
