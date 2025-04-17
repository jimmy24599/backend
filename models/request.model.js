import mongoose from "mongoose";

const requestSchema = new mongoose.Schema({
    customerID:{
        type:String,
        required:true
    },
    providerId:{
        type:String,
    },
    description:{
        type: String,
    },
    budget:{
        type: Number,
        required: true
    },
    service:{
        type: String,
        required: true
    },
    details: {
        type: mongoose.Schema.Types.Mixed, 
      },
    price:{
        type:Number,
    },
    date:{
        type: Date,
        required: true
    },
    location: {
        type: {
          latitude: Number,
          longitude: Number
        },
        required: false
      },
    state:{
        type: String,
        default: 'in-progress',
    },
    paid:{
        type:Boolean,
    },
    reviewId:{
        type: String,
    },
    image: {
        type: String,
        default: null
      }
    
}, {
    timestamps:true   //created at, updated at
}); 

const Request = mongoose.model('Request', requestSchema) //create request collection

export default Request;