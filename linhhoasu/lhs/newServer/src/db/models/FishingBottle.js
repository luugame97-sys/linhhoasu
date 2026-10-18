'use strict';
const {Schema,model}=require('mongoose');
const schema=new Schema({
 _id:String,instance:{type:String,index:true},owner:{type:String,index:true},name:String,content:String,
 holder:{type:String,default:'',index:true},requestKey:{type:String,default:''},status:{type:String,default:'available'},
 replies:{type:[Schema.Types.Mixed],default:()=>[]},praises:{type:[String],default:()=>[]},
 createdAt:{type:Date,default:Date.now},expireAt:{type:Date,index:{expires:0}},
},{versionKey:false});
schema.index({instance:1,status:1,createdAt:1});
module.exports=model('FishingBottle',schema);
