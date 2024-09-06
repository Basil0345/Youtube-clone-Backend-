import mongoose, { isValidObjectId } from "mongoose"
import { Video } from "../models/video.model.js"
import { User } from "../models/user.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { cleanUpFiles, deleteFileOnCloudinary, uploadOnCloudinary } from "../utils/cloudinary.js"

const publishAVideo = asyncHandler(async (req, res) => {
    const { title, description } = req.body;

    // Get the video and thumbnail files
    const videoFilePath = req.files?.videoFile?.[0]?.path || "";
    const thumbnailPath = req.files?.thumbnail?.[0]?.path || "";

    // Validate the required fields
    if (!title || !videoFilePath || !thumbnailPath) {
        cleanUpFiles([videoFilePath, thumbnailPath]);  // Clean up any uploaded files if validation fails
        throw new ApiError(400, "Title, video file, and thumbnail are required to publish a video.");
    }

    // Upload to cloudinary and create video record in the database
    const videoFile = await uploadOnCloudinary(videoFilePath);
    const thumbnail = await uploadOnCloudinary(thumbnailPath);

    if (!videoFile || !thumbnail) {
        throw new ApiError(400, "Failed to upload video or thumbnail. Please try again.");
    }

    const video = await Video.create({
        title,
        description: description ? description : "",
        videoFile: videoFile.url,
        thumbnail: thumbnail.url,
        duration: videoFile.duration,
        owner: req.user._id,
    })

    if (!video) {
        throw new ApiError(500, "Something went wrong while uploading the video")
    }

    return res.status(201).json(
        new ApiResponse(201, video, "Video Successfully Uploaded")
    )

});


const updateVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    const { title, description } = req.body;
    const userId = req.user._id;
    const thumbnailFilePath = req.file?.path || "";

    // Validate if there is anything to update
    if (!title && !description && !thumbnailFilePath) {
        throw new ApiError(400, "Nothing to edit");
    }

    // Validate videoId
    if (!mongoose.Types.ObjectId.isValid(videoId)) {
        cleanUpFiles([thumbnailFilePath]);
        throw new ApiError(400, "Invalid video ID");
    }

    // Find the video by ID
    const video = await Video.findById(videoId);
    if (!video) {
        cleanUpFiles([thumbnailFilePath]);
        throw new ApiError(404, "Video not found");
    }

    // Check if the user is the owner of the video
    if (video.owner.toString() !== userId.toString()) {
        cleanUpFiles([thumbnailFilePath]);
        throw new ApiError(403, "You are not authorized to update this video");
    }

    // Initialize newThumbnailUrl with existing thumbnail
    let newThumbnailUrl = video.thumbnail;

    // If a new thumbnail file is provided, upload it and update the thumbnail URL
    if (thumbnailFilePath) {
        const thumbnail = await uploadOnCloudinary(thumbnailFilePath);
        if (!thumbnail) {
            cleanUpFiles([thumbnailFilePath]);
            throw new ApiError(500, "Error uploading the new thumbnail");
        }

        // Delete the old thumbnail from Cloudinary if it exists
        if (newThumbnailUrl) {
            await deleteFileOnCloudinary(newThumbnailUrl);
        }

        newThumbnailUrl = thumbnail.url;
    }

    // Update the video details
    video.title = title || video.title;
    video.description = description || video.description;
    video.thumbnail = newThumbnailUrl;

    // Save the updated video
    const updatedVideo = await video.save();

    // Respond with the updated video details
    return res.status(200).json(
        new ApiResponse(200, updatedVideo, "Video updated successfully")
    );
});



const getAllVideos = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, query, sortBy, sortType, userId } = req.query
    //TODO: get all videos based on query, sort, pagination
})

const getVideoById = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    //TODO: get video by id
})



const deleteVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    //TODO: delete video
})

const togglePublishStatus = asyncHandler(async (req, res) => {
    const { videoId } = req.params
})

export {
    getAllVideos,
    publishAVideo,
    getVideoById,
    updateVideo,
    deleteVideo,
    togglePublishStatus
}