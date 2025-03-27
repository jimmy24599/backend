import mongoose from "mongoose";

const MessageSchema = new mongoose.Schema({
  senderId: {
    type: String, 
    required: true,
  },
  receiverId: {
    type: String, 
    required: true,
  },
  chatId: {
    type: String, 
    required: true,
  },
  text: {
    type: String,
    required: true,
  },
  seen: { 
    type: Boolean, 
    default: false }
}, { timestamps: true });

export default mongoose.model("Message", MessageSchema);
