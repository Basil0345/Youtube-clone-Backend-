import dotenv from 'dotenv'
import connectDB from './db/index.js'
import { app } from "./app.js";

dotenv.config({
    path: "./.env"
})




connectDB().then(() => {
    app.on("error", (error) => {
        console.log("ERROR: ", error)
    })
    app.listen(process.env.PORT || 3000, () => {
        console.log(`Server is running on port ${process.env.PORT || 3000}`)
    })
}).catch((err) => {
    console.log("MONGODB db connection FAILED !!! ", err);
})










/*
    (async () => {
        try {
            await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`);
            console.log("connected to database")
            app.on("error", (error) => {
                console.log("ERROR: ", error);
            })
            app.listen(process.env.PORT, () => {
                console.log(`App is listening on PORT ${process.env.PORT}`)
            })
        } catch (error) {
            console.error("ERROR: ", error);
            throw error
        }
    })()

*/