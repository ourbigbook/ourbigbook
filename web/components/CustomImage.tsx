import { DEFAULT_PROFILE_IMAGE } from "lib/utils/constant";

const handleBrokenImage = e => {
  e.target.src = DEFAULT_PROFILE_IMAGE;
  e.target.onerror = null;
};

interface CustomImageProps {
  src: string;
  alt: string;
  className?: string;
}

const CustomImage = ({ src, alt, className }: CustomImageProps) => {
  const props: any = {}
  if (className) {
    props.className = className
  }
  return (
    <img
      src={src}
      alt={alt}
      onError={handleBrokenImage}
      {...props}
    />
  )
}

export default CustomImage;
