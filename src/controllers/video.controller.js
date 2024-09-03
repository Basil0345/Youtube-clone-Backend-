import mongoose, { isValidObjectId } from "mongoose"
import { Video } from "../models/video.model.js"
import { User } from "../models/user.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { cleanUpFiles, uploadOnCloudinary } from "../utils/cloudinary.js"
import { response } from "express"

const publishAVideo = asyncHandler(async (req, res) => {
    const { title, description } = req.body;

    // Get the video and thumbnail files
    const videoFilePath = req.files?.videoFile?.[0]?.path || "";
    const thumbnailPath = req.files?.thumbnail?.[0]?.path || "";

    // Validate the required fields
    if (!title || !videoFilePath || !thumbnailPath) {
        cleanUpFiles([videoFile, thumbnail]);  // Clean up any uploaded files if validation fails
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
        description: description ? description : " ",
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


const getAllVideos = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, query, sortBy, sortType, userId } = req.query
    //TODO: get all videos based on query, sort, pagination
})

const getVideoById = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    //TODO: get video by id
})

const updateVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    //TODO: update video details like title, description, thumbnail

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