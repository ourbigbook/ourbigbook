import { defaultProfileImage } from 'front/config'

const handleBrokenImage = e => {
  console.error(e.target.src);
  e.target.src = defaultProfileImage;
  e.target.onerror = null;
};

interface CustomImageProps {
  src: string;
  alt?: string;
  className?: string;
}

const CustomImage = ({ src, alt, className }: CustomImageProps) => {
  return <img {...{
    alt,
    className,
    onError: handleBrokenImage,
    src,
  }} />
}

export default CustomImage;
