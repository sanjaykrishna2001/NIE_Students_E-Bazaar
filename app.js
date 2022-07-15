require('dotenv').config();
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const findOrCreate = require("mongoose-findorcreate");
const cloudinary = require("./utils/cloudinary");
const upload = require("./utils/multer");
const e = require('express');

const app = express(); 

app.use(express.static("public"));
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({
  extended: true
}));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

mongoose.connect(process.env.MONGO_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useFindAndModify: false
});
mongoose.set("useCreateIndex", true);

const productSchema = new mongoose.Schema({
  name: String,
  price: Number,
  description: String,
  type: String,
  seller: [mongoose.Schema.Types.ObjectId],
  sellerName: String,
  image: String,
  cloudinary_id: String,
  sold:{
    type:Boolean,
    default:false,
    require:true
  }
});

const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  contact: String,
  googleId: String,
});

const emailSchema = new mongoose.Schema({
  email_Id: String,
  admin: Boolean
});


userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const User = new mongoose.model("User", userSchema);
const Product = new mongoose.model("Product", productSchema);
const EmailList = new mongoose.model("EmailList", emailSchema);



passport.use(User.createStrategy());

passport.serializeUser(function (user, done) {
  done(null, user.id);
});

passport.deserializeUser(function (id, done) {
  User.findById(id, function (err, user) {
    done(err, user);
  });
});

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
      callbackURL: "http://localhost:3000/auth/google/home",
      userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
    },
    function (accessToken, refreshToken, profile, cb) {
      //console.log(profile);
      //console.log(profile.photos[0].value);
      User.findOrCreate(
        { googleId: profile.id },
        { name: profile.displayName, email: profile.emails[0].value },
        function (err, user) {
          return cb(err, user);
        }
      );
    }
  )
);


app.get("/auth/google",
  passport.authenticate("google", { scope: ['profile', 'email'] }));

app.get("/auth/google/home",
  passport.authenticate('google', { failureRedirect: '/login' }),
  function (req, res) {
    // Successful authentication, redirect home.
    res.redirect('/home');
  });
const a = []
app.get("/manage", function (req, res) {
  if (req.isAuthenticated()) {
    EmailList.find({}, function (err, email_list) {
      res.render("manage", { user: req.user, EmailList: email_list });
    });
  } else {
    res.redirect("/login");
  }
});
app.get("/login", function (req, res) {
  res.render("login");
});

app.get("/signup", function (req, res) {
  res.render("signup",{msg:''});
});

app.get("/", function (req, res) {
  if (req.isAuthenticated()) {
    res.redirect("/home");
  } else {
    res.redirect("/login");
  }
});

// function timeout(res) {
//   res.redirect("/signup");
// }

app.get("/home", function (req, res) {
  if (req.isAuthenticated()) {
    EmailList.exists({ email_Id: req.user.email }, function (err, doc) {
     if(!err){
      if(doc){
        EmailList.findOne({ email_Id: req.user.email }, function (err, doc) {
          if (err)
            console.log(err);
          else {
            res.render("home", { user: req.user, mail: doc});
          }
        });
      }
      else{
        req.logout();
        res.render("signup",{msg:"Email doesn't belong to NIE,Please contact admin dilipsingh@gmail.com"});

      }
     }
    });  

    
    // const mail=emailList.findOne({email:user.email})
    // res.render("home", { user: req.user, });
  } else {
    res.redirect("/login");
  }
});
;

app.get("/working", function (req, res) {
  if (req.isAuthenticated()) {
    res.render("working", { user: req.user });
  } else {
    res.redirect("/login");
  }
});

app.get("/about", function (req, res) {
  if (req.isAuthenticated()) {
    res.render("about", { user: req.user });
  } else {
    res.redirect("/login");
  }
});

app.get("/add", function (req, res) {
  if (req.isAuthenticated()) {
    res.render("add", { user: req.user });
  } else {
    res.redirect("/login");
  }
});

app.get("/profile", function (req, res) {
  if (req.isAuthenticated()) {
    Product.find({ seller: req.user._id }, function (err, foundProducts) {
      if (err)
        console.log(err);
      else {
        res.render("profile", { user: req.user, product: foundProducts });
      }
    });
  } else {
    res.redirect("/login");
  }
});

app.get("/sold", function (req, res) {
  if (req.isAuthenticated()) {
    Product.find({ sold:true}, function (err, foundProducts) {
      if (err)
        console.log(err);
      else {
        res.render("sold", { user: req.user, product: foundProducts });
      }
    });
  } else {
    res.redirect("/login");
  }
});

app.get("/donate", function (req, res) {
  if (req.isAuthenticated()) {
    Product.find({ price: { $lt: 1 } ,sold:false}, function (err, foundProducts) {
      if (err)
        console.log(err);
      else {
        res.render("donate", { user: req.user, product: foundProducts });
      }
    });
  } else {
    res.redirect("/login");
  }
});

// fuzzy search reg expression return function
function escapeRegex(text) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
};


app.get("/category/:type",function(req,res){
  if(req.isAuthenticated()){
    const type= req.params.type;
    if(req.query.search) {
    const search=req.query.search;
    const regex = new RegExp(escapeRegex(req.query.search),'gi');
    if (type === "All") { 
      Product.find({sold:false,name: regex}, function (err, foundProducts) {
        if (err)
          console.log(err); 
        else { 
          
          res.render("category", { user: req.user, product: foundProducts ,type});
        }
      });
    }
    else { 
      Product.find({ type: type,sold:false,name: regex }, function (err, foundProducts) {
        if (err)
          console.log(err);
        else {
          res.render("category", { user: req.user, product: foundProducts, type});
        }
      });
    }
    }
    else{
      if (type === "All") { // if the type is All then all item are shown
        Product.find({sold:false}, function (err, foundProducts) {
          if (err)
            console.log(err); // if any error the error message is shown
          else { //if no error then all items are shown
            res.render("category", { user: req.user, product: foundProducts ,type});
          }
        });
      }
      else { //if type is not ALL then the particular items with that type are shown
        Product.find({ type: type,sold:false }, function (err, foundProducts) {
          if (err)
            console.log(err);
          else {
            res.render("category", { user: req.user, product: foundProducts ,type});
          }
        });
      }
    }
  }
  else{
    res.redirect("/login");
  }
});





// //items with given category are shown to the user
// app.get("/category/:type", function (req, res) {
//   if (req.isAuthenticated()) { //checks for for user authentication
//     const type = req.params.type;
    
//   } else {
//     res.redirect("/login");// if user not authenticated then its redirected to login page
//   }
// });

app.get("/seller/:sellerId", function (req, res) {
  if (req.isAuthenticated()) {
    const sellerId = req.params.sellerId;
    //console.log(sellerId);
    User.findById(sellerId, function (err, foundUser) {
      if (err)
        console.log(err);
      else {
        Product.find({ seller: foundUser._id,sold:false }, function (err, foundProducts) {
          if (err)
            console.log(err);
          else {
            res.render("seller", { user: req.user, seller: foundUser, product: foundProducts });
          }
        });
      }
    });
  } else {
    res.redirect("/login");
  }
});

app.get("/delete/:productId", function (req, res) {
  Product.findOne({ _id: req.params.productId }, function (err, doc1) {
    if (err) {
      console.log(err);
    }
    else {
      if (doc1) {
        if (doc1.sold === false) {
          Product.findOneAndUpdate({ _id: req.params.productId }, { sold: true }, { new: true }, function (err, doc) {
            if(err){
              console.log(err);
            }
            else{
              if (doc) {

              }
            }
          });
        }
        else {
          Product.findOneAndDelete({ _id: req.params.productId }, function (err, doc) {
            if(err){
              console.log(err);
            }
            else{
              if (doc) {

              }
            }
          });
        }
      }
    }

  });

  res.redirect("/profile");
});

app.get("/edit", function (req, res) {
  if (req.isAuthenticated()) {
    res.render("edit", { user: req.user });
  } else {
    res.redirect("/login");
  }
});

app.get("/logout", function (req, res) {
  req.logout();
  res.redirect("/");
});

app.post("/signup", function (req, res) {
  //gets name, email and password from user and checks this user already present or not
  EmailList.exists({ email_Id: req.body.username }, function (err, doc) {
    {
      if (!err) {
        if (doc) {
          User.register({ username: req.body.username, name: req.body.fullname }, req.body.password, function (err, user) {
            if (err) {
              console.log(err);
              res.redirect("/login");
            } else { // if the user not present then new user is created and authenticated
              passport.authenticate("local")(req, res, function () {
                const userEmail = req.user.username;
                User.findOneAndUpdate({ _id: req.user._id }, { $set: { email: userEmail } }, { upsert: true }, function (err, doc) {
                  if (err)
                    console.log(err);
                  else
                    console.log("updated");
                });
                res.redirect("/home"); //after authentication its redirected to home page
              });
            }
          });
        }
        else{
          res.render("signup",{msg:"Email doesn't belong to NIE, Please contact admin dilipsingh@gmail.com"});
        }
      }
    }
  });

});


app.post("/login", function (req, res) {

  // gets email and password from user
  const user = new User({
    username: req.body.username,
    password: req.body.password
  });

  req.login(user, function (err) {
    if (err) // if any wrong email or password then the relavent error message is shown 
      console.log(err);
    else { //if the email and passwword are matched then that user gets authenticated
      passport.authenticate("local")(req, res, function () {
        res.redirect("/home"); // after authentication its redirected to home page 
      });
    }
  });
});

app.post("/add_email", function (req, res) {
  EmailList.exists({ email_Id: req.body.username_1 }, function (err, doc) {
    if (!err) {
      if (!doc) {
        let emailLists = new EmailList({
          email_Id: req.body.username_1,
          admin: false
        });
        emailLists.save();
      }
    }
  });
  res.redirect("/manage");
});
app.post("/delete_email", function (req, res) {
  EmailList.exists({ email_Id: req.body.username_3 }, function (err, doc) {
    if (!err) {
      if (doc) {
        EmailList.findOneAndDelete({ email_Id: req.body.username_3 }, function (err, doc) {

        });
      }
    }
  });
  res.redirect("/manage");
})
app.post("/add_admin", function (req, res) {
  EmailList.exists({ email_Id: req.body.username_2 }, function (err, doc) {
    if (!err) {
      if (!doc) {
        let emailLists = new EmailList({
          email_Id: req.body.username_2,
          admin: true
        });
        emailLists.save();
      }
      else {
        EmailList.findOneAndUpdate({ email_Id: req.body.username_2 }, { admin: true }, { new: true }, function (err, doc) {
          //
        });
      }
    }
  });
  res.redirect("/manage");
});

app.post("/delete_admin", function (req, res) {
  EmailList.exists({ email_Id: req.body.username_4 }, function (err, doc) {
    if (!err) {
      if (doc) {
        EmailList.findOneAndUpdate({ email_Id: req.body.username_4 }, { admin: false }, { new: true }, function (err, doc) {

        });
      }
    }
  });
  res.redirect("/manage");
})

// app.post("/add",function(req,res){
//   //console.log(req.file);
//   let product = new Product({
//     name:req.body.name,
//     price:req.body.price,
//     description:req.body.description,
//     type:req.body.radio,
//     seller:req.user._id,
//     sellerName:req.user.username,
//   });
//
//   product.save();
//
//   res.redirect("/category/All");
// });

app.post("/add", upload.single("image"), async (req, res) => {
  try {
    const result = await cloudinary.uploader.upload(req.file.path);
    //when a seller add a item new document is created in product collection and those valuses are stored
    let product = new Product({
      name: req.body.name, //name of the item
      price: req.body.price, // price of the item
      description: req.body.description, // description of the item
      type: req.body.radio, //type(category) of the item
      seller: req.user._id, // here we also store seller details to know who is selling this item
      sellerName: req.user.name, // seller name
      image: result.secure_url, // image of the item
      cloudinary_id: result.public_id,
    });
    // document is saved
    await product.save();
    //then the page is redirected to all products and the added product shown there
    res.redirect("/category/All");
  } catch (err) {
    console.log(err); //if any error the error message is shown
  }
});

app.post("/edit", function (req, res) {
  User.findOneAndUpdate({ _id: req.user._id }, { $set: { name: req.body.name, email: req.body.email, contact: req.body.contact } }, { upsert: true }, function (err, doc) {
    if (err)
      console.log(err);
    else
      console.log("updated");
  });
  res.redirect("/profile");
});











app.listen(process.env.PORT || 3000, function () {
  console.log("server is listening to port 3000.");
});