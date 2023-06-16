import express from "express"
import path from 'path'
import bodyParser from "body-parser"
import mongoose from "mongoose"
import cookieParser from "cookie-parser"
import jwt from "jsonwebtoken"
import multer from "multer"
import { Readable } from "stream"
const { ObjectId } = mongoose.Types;


mongoose.connect("mongodb+srv://admin:admin@cluster0.tmoxttg.mongodb.net/?retryWrites=true&w=majority",{
    dbName:"cms",
}).then(()=>console.log('Database Connected'))
.catch((e)=>console.log(e))



const userSchema = new mongoose.Schema({
    name:String,
    email:String,
    role:String,
    password:String
})

const User = mongoose.model("User",userSchema)

const postSchema = new mongoose.Schema({
    title: { type: String, required: true },
    image: { type: String, required: true },
    description: { type: String, required: true }
})

const Post = mongoose.model("Post",postSchema);


// Retrieve post function
const retrievePosts = async ()=>{
    const posts = await Post.find();
  const results = [];
  const gfsFiles = mongoose.connection.db.collection('fs.files');
  const gfsChunks = mongoose.connection.db.collection('fs.chunks');

  for (const post of posts) {
    const imageId = post.image;
    const file = await gfsFiles.findOne({ _id: new ObjectId(imageId) });

    if (!file) {
      continue;
    }

    const chunks = await gfsChunks.find({ files_id: file._id }).sort({ n: 1 }).toArray();
    const buffers = chunks.map((chunk) => chunk.data.buffer);
    const imageData = Buffer.concat(buffers);

    const result = {
      post: post,
      imageData: imageData,
    };

    results.push(result);
  }

  return results;
}

// Specify the storage settings for uploaded files
const storage = multer.memoryStorage();

// Create the multer instance with the specified storage settings
const upload = multer({ storage: storage });

const app = express()

app.use(express.static(path.join(path.resolve(),"public")))
app.use(bodyParser.json())
app.use(express.urlencoded({extended:true}))
app.use(cookieParser())


// console.log(path.join(path.resolve(),"public"))

// Setting view engine
app.set("view engine","ejs")

const isAuthenticated = async(req,res,next)=>{
    const {token} = await req.cookies;
    if(token){
        next();
    }
    else{
        // res.render("login")
        res.redirect("/login")
    }

}

const roleHandlerAdm = async (req,res,next)=>{
    const {token} = req.cookies;
    const decoded = await jwt.decode(token);
    // console.log(decoded);
    // console.log(decoded.role)
    if(decoded.role==='admin'){
        next();
    }
    else{
        // res.render("login")
        res.redirect("/login")

    }

}
const roleHandlerUsr = async (req,res,next)=>{
    const {token} = req.cookies;
    const decoded = await jwt.decode(token);
    // console.log(decoded);
    // console.log(decoded.role)
    if(decoded.role==='user'){
        next();
    }
    else{
        // res.render("login")
        res.redirect("/login")
    }

}

app.get("/",(req,res)=>{
    
    res.render('main')

})

app.get("/login",(req,res)=>{
    res.render("login")
})
app.get("/register",(req,res)=>{
    res.render("registration")
})

app.get("/admin",isAuthenticated,roleHandlerAdm,(req,res)=>{
    res.render("adminhome")
})


app.get("/user",isAuthenticated,roleHandlerUsr,(req,res)=>{
    res.render("userhome")
})

app.get("/logout",(req,res)=>{
    res.cookie("token","",{expires:new Date(Date.now())})
    res.redirect("/login")
})

app.get("/createPost",isAuthenticated,roleHandlerAdm,(req,res)=>{
    res.render("createpost")
})

app.post("/createPost",isAuthenticated,roleHandlerAdm,upload.single('image'),async (req,res)=>{
    const newPost = new Post({
        title:req.body.title,
        description:req.body.description
    })
    // obtaining img buffer
    const file = req.file
    // console.log(file)

    // Convert the buffer nto readable stream
    const readableStream = new Readable();
    readableStream.push(file.buffer)
    readableStream.push(null)

    // Store the image in GridFS
    const gfs =  new mongoose.mongo.GridFSBucket(mongoose.connection.db);
    const uploadStream = gfs.openUploadStream(file.originalname);
    const imageId = uploadStream.id;

    readableStream.pipe(uploadStream);
    newPost.image=imageId;

    try{
        const post = await Post.create(newPost)
        // console.log(post)
        // res.send('Post created successfully');
        res.render("createpost",{locals:{message:'Post created successfully'}})
    }
    catch(error){
        res.status(500).render("createpost",{locals:{message:'Error creating post'}})
    }

})


app.get("/posts",isAuthenticated,async (req,res)=>{
    try {
        const results = await retrievePosts();
        const {token} = req.cookies;
        const decoded =  jwt.decode(token);
        
        if(decoded.role==='user'){
            res.render('allposts',{imageData:results})
        }
        else{
            res.render('adminallpost',{imageData:results})

        }
        // res.send(results[0].imageData)

    } catch (error) {
        res.status(500).send('Error retrieving posts')
    }
})

app.post("/updatePost",isAuthenticated,roleHandlerAdm,async (req,res)=>{
    try {
        const {title,description,id} = req.body;
        // console.log({title,description,id})
        const post = await Post.findById(id);
        if(post){
            const updatedPost = await Post.updateOne({ _id: id }, { $set: {title,description} });
            console.log(updatedPost)
            res.status(200)

        }
        else{
            res.status(404)
        }
        
    } catch (error) {
        res.status(500).send('Error updating the database.')
    }
})

app.post("/deletePost",isAuthenticated,async (req,res)=>{
    try {
        const {id} = req.body;
        console.log({id})
        const post = await Post.findById(id);
        if(post){
            const gfsFiles = mongoose.connection.db.collection('fs.files');
            const gfsChunks = mongoose.connection.db.collection('fs.chunks');
            const imageId = post.image;
            // const file = await gfsFiles.findOne({ _id: new ObjectId(imageId) });

            // Delete the image file from fs.chunks
            await gfsChunks.deleteMany({ files_id: new ObjectId(imageId) });

            // Delete the image file from fs.files
            await gfsFiles.deleteOne({ _id: new ObjectId(imageId) });




            ///main error free code
            const deletedPost = await Post.deleteOne({ _id: id });
            console.log(deletedPost)
            res.status(200)

        }
        else{
            res.status(404)
        }
        
    } catch (error) {
        res.status(500).send('Error updating the database.')
    }
})
  
  
  

app.post("/login",async(req,res)=>{

    let {email,password} = req.body;
    const user = await User.findOne({email});
    if(!user){
        // return res.status(401).json({message:"Invalid email or password"})
        res.render("login",{locals:{message:"Invalid email or password"}})

    }
    if(password===user.password){
        const token = jwt.sign({_id:user._id,role:user.role},"efboneifn4pnno2t")
        
        res.cookie("token",token, { expires: new Date(Date.now() + 9000000), httpOnly: true }); 
        if(user.role==='admin'){
            // return res.send({message:'Login admin Succesfull'})
            res.redirect("/admin")
        }else{
        // return res.send({message:'Login user Succesfull'})
        res.redirect("/posts")
    }
    }else{
        // return res.status(401).json({message:"Invalid email or password"})
        res.render("login",{locals:{message:"Invalid email or password"}})

    }
    
})

app.post("/register", async(req, res) => {
    let {name,email,role,password} = req.body;
    const user = await User.create({name,email,role,password})
    // console.log(user)
    res.redirect("/login")
});

app.get("/editUsers",isAuthenticated,roleHandlerAdm,async(req,res)=>{
    const users = await User.find();
    console.log(users)
    res.render("adminuseredit",{locals:{userData:users}})
    // res.send(users)
})




app.post("/updateRole",isAuthenticated,roleHandlerAdm,async (req,res)=>{
    try {
        const {id,role} = req.body;
        const user = await User.findById(id);
        if(user){
            const updatedUser = await User.updateOne({ _id: id }, { $set: {role} });
            console.log(updatedUser)
            res.status(200)

        }
        else{
            res.status(404)
        }
        
    } catch (error) {
        res.status(500).send('Error updating the database.')
    }
})

app.post("/updateUser",isAuthenticated,roleHandlerAdm,async (req,res)=>{
    try {
        const {id,name,email} = req.body;

        const user = await User.findById(id);
        if(user){
            const updatedUser = await User.updateOne({ _id: id }, { $set: {name,email} });
            console.log(updatedUser)
            res.status(200)

        }
        else{
            res.status(404)
        }
        
    } catch (error) {
        res.status(500).send('Error updating the database.')
    }
})

app.post("/deleteUser",isAuthenticated,roleHandlerAdm,async (req,res)=>{
    try {
        const {id} = req.body;

        const user = await User.findById(id);
        if(user){
            const updatedUser = await User.deleteOne({ _id: id });
            console.log(updatedUser)
            res.status(200)

        }
        else{
            res.status(404)
        }
        
    } catch (error) {
        res.status(500).send('Error updating the database.')
    }
})






app.listen(5000,()=>{
    console.log('Server is up and running at port 5000')
})




// {
//     "type": "Buffer",
//     "data": [231,234,134,123]
// }




