import mongoose from "mongoose";
import env from "./env"


const connectDatabase = async (): Promise<void> => {
    try {
    
        await mongoose.connect(env.MONGODB_URI);

        console.log("MongoDb connected successfully");
    } catch (error) {
        console.error("Mongodb connection failed", error);

        process.exit(1);
    }
};

export default connectDatabase;