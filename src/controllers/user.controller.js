import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import fs from "fs";

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

export { registerUser }