import { v2 as cloudinary } from 'cloudinary';
import fs from "fs";

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Utility function to clean up files
const cleanUpFiles = (filePaths) => {
    filePaths.forEach(filePath => {
        if (filePath) {
            try {
                fs.unlinkSync(filePath);
            } catch (error) {
                console.error(`Error removing file: ${filePath}`, error);
            }
        }
    });
};

const uploadOnCloudinary = async (localFilePath) => {
    try {
        if (!localFilePath) return null;
        //upload file on cloudinary
        let response = await cloudinary.uploader.upload(localFilePath, {
            resource_type: 'auto'
        },);
        //file has been uploaded successfull;
        fs.unlinkSync(localFilePath); //remove the locally saved temporary file as upload completes
        return response;
    } catch (error) {
        fs.unlinkSync(localFilePath); //remove the locally saved temporary file as the upload operation got failed
        return null;
    }
}

const deleteFileOnCloudinary = async (fileUrl) => {
    try {
        // Extract public ID from the Cloudinary URL
        let publicId = fileUrl?.split("/")?.pop()?.split(".")[0]

        // Determine the resource type based on the file type
        const isVideo = fileUrl.includes("/video/");

        if (!publicId) {
            return null;
        }

        // Delete the image
        await cloudinary.uploader.destroy(publicId, {
            resource_type: isVideo ? "video" : "image" // Set resource_type based on whether it's a video or image
        })
    }
    catch (error) {
        console.error('Error deleting image:', error.message);
    }
}

export { uploadOnCloudinary, deleteFileOnCloudinary, cleanUpFiles }