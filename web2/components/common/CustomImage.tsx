import { DEFAULT_IMAGE_SOURCE } from "lib/utils/constant";
import handleBrokenImage from "lib/utils/handleBrokenImage";

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
