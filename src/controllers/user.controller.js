import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { deleteFileOnCloudinary, uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import fs from "fs";
import jwt from 'jsonwebtoken';
import mongoose from "mongoose";

const generateAccessAndRefreshTokens = async (userId) => {
    try {
        const user = await User.findById(userId);
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });

        return { accessToken, refreshToken };

    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating refresh and access token");
    }
}

const registerUser = asyncHandler(async (req, res) => {
    //get user details from frontend
    const { username, email, password, fullName } = req.body;

    //provided by multer
    const avatarLocalPath = req.files?.avatar?.[0]?.path || "";
    const coverImageLocalPath = req.files?.coverImage?.[0]?.path || "";

    //validation - not empty
    if (!username || !email || !password || !fullName) {
        throw new ApiError(400, "All fields are required")
    }

    //check for images, check for avatar
    if (!avatarLocalPath) {
        if (coverImageLocalPath) {
            fs.unlinkSync(coverImageLocalPath);
        }
        throw new ApiError(400, "Avatar file is required");
    }

    //check if user already exist: email and username
    const existedUser = await User.findOne({
        $or: [{ username }, { email }]
    })

    if (existedUser) {
        fs.unlinkSync(avatarLocalPath)
        if (coverImageLocalPath) {
            fs.unlinkSync(coverImageLocalPath)
        }
        throw new ApiError(409, "User with email or username already exists");
    }

    //upload them to cloudinary, avatar
    const avatar = await uploadOnCloudinary(avatarLocalPath);
    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    if (!avatar) {
        throw new ApiError(400, "Avatar file is required");
    }

    //create user object - create entry in db
    const user = await User.create({
        fullName,
        username: username.toLowerCase(),
        password,
        email,
        avatar: avatar.url,
        coverImage: coverImage?.url || ""
    })

    //remove password and refresh token field from response
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken",
    )

    if (!createdUser) {
        throw new ApiError(500, "Something went wrong while registering the user")
    }

    return res.status(201).json(
        new ApiResponse(201, createdUser, "User registered Successfully")
    )
})

const loginUser = asyncHandler(async (req, res) => {
    //req.body -> data
    //username or email
    const { email, username, password } = req.body;
    //validate
    if (!username && !email) {
        throw new ApiError(400, "username or email is required");
    }

    if (!password) {
        throw new ApiError(400, "Password is required")
    }
    //find in the user
    const user = await User.findOne({
        $or: [{ email }, { username }]
    })

    if (!user) {
        throw new ApiError(404, "User does not exist")
    }
    //password check
    const isPasswordValid = await user.isPasswordCorrect(password);

    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid user credentials");
    }
    //access and refresh token
    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id);

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken");
    //send cookie

    const options = {
        httpOnly: true,
        secure: true
    }

    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(
                200,
                { user: loggedInUser, accessToken, refreshToken },
                "User logged In Successfully"
            )
        )
    //store refresh token in database
    //send response
})

const logoutUser = asyncHandler(async (req, res) => {
    // req.user -> comming from auth validator middleware (jwtVerify)
    //clear refresh token in db
    //clear cookie from frontend
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $unset: {
                refreshToken: 1 // this removes the field from document
            }
        },
        {
            new: true
        }
    )
    const options = {
        httpOnly: true,
        secure: true
    }
    return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(new ApiResponse(200, {}, "User logged Out"))
})

const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;

    if (!incomingRefreshToken) {
        throw new ApiError(401, "unauthorized request")
    }
    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        )

        const user = await User.findById(decodedToken?._id);

        if (!user) {
            throw new ApiError(401, "Invalid refresh token")
        }

        if (user?.refreshToken !== incomingRefreshToken) {
            throw new ApiError(401, "Refresh Token is expired or used");
        }

        const { accessToken, refreshToken } = await
            generateAccessAndRefreshTokens(user?._id);

        const options = {
            httpOnly: true,
            secure: true
        }

        return res
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", refreshToken, options)
            .json(
                new ApiResponse(200,
                    {
                        accessToken,
                        refreshToken
                    },
                    "Access Token refreshed"
                )
            )

    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token")
    }
})

const changeCurrentPassword = asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
        throw new ApiError(404, "All fields are required");
    }

    const user = await User.findById(req.user?._id);

    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

    if (!isPasswordCorrect) {
        throw new ApiError(400, "Invalid old password");
    }

    user.password = newPassword
    await user.save({ validateBeforeSave: false });

    return res
        .status(200)
        .json(
            new ApiResponse(200, {}, "Password changed successfully")
        )

})

const getCurrentUser = asyncHandler(async (req, res) => {
    return res.
        status(200)
        .json(
            new ApiResponse(200, req.user, "current user fetched successfully")
        )
})

const updateAccountDetails = asyncHandler(async (req, res) => {
    const { fullName, email } = req.body;

    if (!fullName && !email) {
        throw new ApiError(400, "Incomplete update. Please provide at least your fullname or email")
    }

    const updateObject = {
        $set: {}
    }

    if (email) {
        updateObject.$set.email = email;
    }

    if (fullName) {
        updateObject.$set.fullName = fullName;
    }



    const user = await User.findByIdAndUpdate(
        req.user?._id,
        updateObject,
        {
            new: true
        }
    ).select("-password -refreshToken");

    return res.
        status(200)
        .json(
            new ApiResponse(200, user, "Account details updated successfully")
        )
})

const updateUserAvatar = asyncHandler(async (req, res) => {
    //provided by multer
    const avatarLocalPath = req.file?.path || "";

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is missing");
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath); //new image url

    if (!avatar?.url) {
        throw new ApiError(400, "Error while uploding avatar");
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                avatar: avatar?.url
            }
        },
        { new: true }
    ).select("-password -refreshToken")

    await deleteFileOnCloudinary(req.user?.avatar) //sending old image url to delete from cloud

    return res.
        status(200)
        .json(
            new ApiResponse(200, user, "Avatar picture updated successfully")
        )
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
    //provided by multer
    const coverImageLocalPath = req.file?.path || "";

    if (!coverImageLocalPath) {
        throw new ApiError(400, "cover image file is missing");
    }

    const coverImage = await uploadOnCloudinary(avatarLocalPath); //new image url

    if (!coverImage?.url) {
        throw new ApiError(400, "Error while uploding avatar");
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                coverImage: coverImage?.url
            }
        },
        { new: true }
    ).select("-password -refreshToken")

    await deleteFileOnCloudinary(req.user?.coverImage) //sending old image url to delete from cloud

    return res.
        status(200)
        .json(
            new ApiResponse(200, user, "cover image updated successfully")
        )
});

const getUserChannelProfile = asyncHandler(async (req, res) => {
    const { username } = req.params;
    //isSubscibed
    // isOwner
    if (!username?.trim()) {
        throw new ApiError(400, "username is missing");
    }
    //aggregation pipeline
    const channel = await User.aggregate([
        //stage 1 - finding user 
        {
            $match: { username: username?.toLowerCase() }
        },
        //stage 2 - finding subscribers (followers)
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "channel",
                as: "subscribers"
            }
        },
        //stage 3 - finding users's subscriptions (followings)
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "subscriber",
                as: "subscribedTo"
            }
        },
        //stage 4 - adding new fields -> subscribersCount & channelSubscribedToCount
        {
            $addFields: {
                subscribersCount: {
                    $size: "$subscribers"
                },
                channelSubscribedToCount: {
                    $size: "$subscribedTo"
                },
                isSubscribed: {
                    $cond: {
                        if: { $in: [req.user?._id, "$subscribers.subscriber"] },
                        then: true,
                        else: false
                    }
                },
                isOwner: {
                    $eq: ["$username", req.user?.username]
                }
            }
        },
        {
            $project: {
                fullName: 1,
                username: 1,
                subscribersCount: 1,
                channelSubscribedToCount: 1,
                isSubscribed: 1,
                avatar: 1,
                coverImage: 1,
                email: 1,
                isOwner: 1
            }
        }
    ])

    console.log(channel)

    if (!channel?.length) {
        throw new ApiError(400, "Channel does not exists");
    }

    return res
        .status(200)
        .json(
            new ApiResponse(200, channel?.[0], "Channel fetched successfully")
        )
}) //TODO: isOwner, isSubscribed

const getWatchHistory = asyncHandler(async (req, res) => {
    const user = await User.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(req.user?._id)
            }
        },
        {
            $lookup: {
                from: "videos",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline: [
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline: [
                                {
                                    $project: {
                                        fullName: 1,
                                        username: 1,
                                        avatar: 1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields: {
                            owner: {
                                $first: "$owner"
                            }
                        }
                    }
                ]
            }
        }

    ])
    return res.status(200).json(
        new ApiResponse(200,
            user?.[0].watchHistory,
            "Watch history fetched successfully"
        )
    )
})

export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile,
    getWatchHistory
}