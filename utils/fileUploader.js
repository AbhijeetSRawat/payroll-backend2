import { v2 as cloudinary } from 'cloudinary';

const uploadFileToCloudinary = async (file, folder, height, quality) => {
  const extension = file.name.split('.').pop().toLowerCase();

  
      const options = {
    folder,
    resource_type: extension === "pdf" ? "raw" : "auto",
    public_id:
      extension === "pdf"
        ? `${folder}/policy-${Date.now()}.pdf` // ⬅️ Extension manually added
        : `${folder}/file-${Date.now()}`,
  };
  

  if (height) options.height = height;
  if (quality) options.quality = quality;

  const result = await cloudinary.uploader.upload(file.tempFilePath, options);
  return {
    result,
    mimeType: extension === "pdf" ? "application/pdf" : result.resource_type === "image" ? "image/*" : "unknown",
  };
};

export default uploadFileToCloudinary;
