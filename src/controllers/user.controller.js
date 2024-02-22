import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import fs from "fs";

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
    let test = await User.findByIdAndUpdate(
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

})

export { registerUser, loginUser, logoutUser, refreshAccessToken }