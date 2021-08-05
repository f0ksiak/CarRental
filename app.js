// modules
const express = require('express');
const exphbs = require('express-handlebars');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const bcrypt = require('bcryptjs');
const formidable = require('formidable');

// app init
const app = express();
//body-parser
app.use(bodyParser.urlencoded({extended:false}));
app.use(bodyParser.json());
// Authentication Config
app.use(cookieParser());
app.use(session({
    secret: 'ostrysmrod',
    resave: true,
    saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());
// load helpers
const {requireLogin,ensureGuest} = require('./helpers/authHelper');
const {upload} = require('./helpers/aws');

// load passports
require('./passport/local')
require('./passport/facebook');
//user as global object
app.use((req,res, next) => {
    res.locals.user = req.user || null;
    next();
});
// load config files
const keys = require('./config/keys');
//load collections
const User = require('./models/user');
const Contact = require('./models/contact');
const Car = require('./models/car');
const Chat = require('./models/chat');
// MongoDB connection
mongoose.connect(keys.MongoDB,{
    useNewUrlParser: true,
    useUnifiedTopology: true
}, () => {
    console.log('MongoDB is connected');
});
//view engine
app.engine('handlebars', exphbs({
    defaultLayout: 'main',
    runtimeOptions: {
      allowProtoPropertiesByDefault: true,
      allowProtoMethodsByDefault: true,
    },

}));
app.set('view engine', 'handlebars');
//client side connection
app.use(express.static('public'));
// port creation
const port = process.env.PORT || 3000;
//home route
app.get('/',ensureGuest,(req,res) => {
    res.render('home', {
        title: 'Home'
    });
})
app.get('/about',ensureGuest,(req, res) => {
    res.render('about', {
        title: 'About us'
    });
});
app.get('/contact',requireLogin,(req, res) => {
    res.render('contact', {
        title: 'Contact us'
    });
    // contact data
    app.post('/contact',requireLogin, (req, res) =>{
      console.log(req.body);
      const newContact = {
          name: req.user._id,
          message: req.body.message
      }
      new Contact(newContact).save((err,user)=> {
          if (err) {
              throw err;
          } else {
              console.log('Message received', user);
          }
      })
    });
});
app.get('/signup',ensureGuest,(req, res) => {
    res.render('signupForm', {
        title: 'Register'
    });
});
app.post('/signup',ensureGuest, (req, res) => {
    console.log(req.body);
    let errors = [];
    if (req.body.password !== req.body.password2) {
        errors.push({text:'Password does not match!'});
    }
    if (req.body.password.length < 6) {
        errors.push({text:'Password must be at least 6 characters long'})
    }
    if (errors.length > 0) {
        res.render('signupForm', {
            errors:errors,
            firstname: req.body.firstname,
            lastname: req.body.lastname,
            password: req.body.password,
            password2: req.body.password2,
            email: req.body.email
        });
    }else {
       User.findOne({email:req.body.email})
       .then((user) => {
           if (user) {
               let errors = []
               errors.push({text:'Email already exist'})
               res.render('signupForm', {
                errors:errors,
                firstname: req.body.firstname,
                lastname: req.body.lastname,
                password: req.body.password,
                password2: req.body.password2,
                email: req.body.email
               });

           }else {
               let salt = bcrypt.genSaltSync(10);
               let hash = bcrypt.hashSync(req.body.password, salt);
            
               const newUser = {
                    firstname: req.body.firstname,
                    lastname: req.body.lastname,
                    password: hash,
                    email: req.body.email
               }
               new User(newUser).save((err,user) => {
                   if (err) {
                       throw err
                   }
                   if (user) {
                       let success = [];
                       success.push({text:'Account creation was successful! You can login now'})
                       res.render('loginForm', {
                           success:success
                       })
                   }
               })
           }
       }) 
    }
})
app.get('/displayLoginForm',ensureGuest, (req, res) => {
    res.render('loginForm',{
        title:'Login'
    });
});
//passport auth
app.post('/login', passport.authenticate('local', {
    successRedirect: '/profile',
    failureRedirect: '/loginErrors'
}));
app.get('/auth/facebook',passport.authenticate('facebook',{
    scope: ['email']
}));
app.get('/auth/facebook/callback',passport.authenticate('facebook',{
    successRedirect: '/profile',
    failureRedirect:'/'
}));
// Display Account
app.get('/profile',requireLogin, (req, res) => {
    User.findById({_id:req.user._id})
    .then((user) => {
        user.online = true;
        user.save((err, user) => {
            if (err) {
                throw err;
            }
            if (user) {
                res.render('profile', {
                    user: user,
                    title: 'Profile'

                });
            }
        })
    });
});
app.get('/loginErrors', (req, res) => {
    let errors = [];
    errors.push({text:'User not found or Password is incorrect!'});
    res.render('loginForm', {
        errors:errors,
        title:'Error'
    });
});
// list cars
app.get('/listCar', requireLogin, (req, res) => {
    res.render('listCar', {
        title: 'Listing'
    });
});
app.post('/listCar', requireLogin, (req, res) => {
    const newCar = {
        owner: req.user._id,
        make: req.body.make,
        model: req.body.model,
        year: req.body.year,
        type: req.body.type
    }
    new Car(newCar).save((err, car) => {
        if (err) {
            throw err;
        }
        if (car){
            res.render('listCar2', {
                title: 'Finish',
                car: car
            });

            
        }
    })
    
});
app.post('/listCar2', requireLogin, (req, res) => {
    Car.findOne({_id: req.body.carID, owner: req.user._id})
    .then ((car) => {
        let imageUrl = {
            imageUrl: `https://car-rental-image.s3.us-east-2.amazonaws.com/${req.body.image}`
        };
        car.pricePerHour = req.body.pricePerHour;
        car.pricePerWeek = req.body.pricePerWeek;
        car.location = req.body.location;
        car.image.push(imageUrl);
        car.save((err, car) => {
            if (err) {
                throw err;
            }
            if (car){
                res.redirect('/showCars');
            }
        })
    })
});
app.get('/showCars', requireLogin, (req, res) => {
    Car.find({})
    .populate('owner')
    .sort({date: 'desc'})
    .then ((cars) => {
        res.render('showCars', {
            cars: cars
        })
    })
})
// Image receive
app.post('/uploadImage', requireLogin, upload.any(), (req, res) => {
    const form = new formidable.IncomingForm();
    form.on('file', (field, file) => {
        console.log(file);
    });
    form.on('error', (err) => {
        console.log(err)
    });
    form.on('end', () => {
        console.log('Image received succesfully');
    });
    form.parse(req);
})
// logout
app.get('/logout', (req,res) => {
    User.findById({_id:req.user._id})
        .then((user) => {
            user.online = false;
            user.save((err,user) => {
                if (err) {
                    throw err;
                }
                if (user) {
                    req.logout();
                    res.redirect('/');
                }
            });
        });
});
//car owner page
app.get('/contactOwner/:id', requireLogin, (req,res) =>{
    User.findOne({_id:req.params.id}).then((owner)=>{
        res.render('ownerProfile',{
            owner:owner
        });
    }).catch((err)=>{console.log(err)});
});
// car display
app.get('/displayCar/:id', requireLogin, (req,res) =>{
    Car.findOne({_id:req.params.id}).then((car) =>{
        res.render('displayCar',{
            car:car
        });
    }).catch((err) => {console.log(err)});
});
//chat with owner
app.get('/chatOwner/:id', requireLogin, (req,res) =>{
    Chat.findOne({sender: req.params.id, receiver: req.user._id})
    .then((chat) => {
        if (chat) {
            chat.date = new Date(),
            chat.senderRead = false;
            chat.receiverRead = true;
            chat.save()
            .then((chat) => {
                res.redirect(`/chat/${chat._id}`)
            }).catch((err) => {console.log(err)});
        }else {
            Chat.findOne({sender: req.user._id, receiver: req.params.id})
            .then((chat) => {
                if (chat) {
                chat.senderRead = true;
                chat.receiverRead = false;
                chat.date = new Date()
                chat.save()
                .then((chat) => {
                    res.redirect(`/chat/${chat._id}`);

                }).catch((err) => {console.log(err)});
            } else {
                const newChat = {
                    sender: req.user._id,
                    receiver: req.params.id,
                    date: new Date()
                }
                new Chat(newChat).save().then((chat) => {
                    res.redirect(`/chat/${chat._id}`);
                }).catch((err) => {console.log(err)});
            }
            }).catch((err) => {console.log(err)});
        }
    }).catch((err) => {console.log(err)});
    
});
// Handle /chat Id route
app.get('/chat/:id', (req, res) => {
    Chat.findOne({_id:req.params.id})
    .populate('sender')
    .populate('receiver')
    .populate('dialogue.sender')
    .populate('dialogue.receiver')
    .then((chat) => {
        res.render('chatRoom', {
            chat: chat
        })
    }).catch((err) => {console.log(err)});
});
// Post req chat/ID
app.post('/chat/:id', (req, res) => {
    Chat.findById({_id:req.params.id})
    .populate('sender')
    .populate('receiver')
    .populate('dialogue.sender')
    .populate('dialogue.receiver')
    .then((chat) => {
        const newDialogue = {
            sender: req.user._id,
            date: new Date(),
            senderMessage: req.body.message
        }
        chat.dialogue.push(newDialogue);
        chat.save((err, chat) => {
            if (err){
                console.log(err)
            }
            if (chat) {
                Chat.findOne({_id:chat._id})
                .populate('sender')
                .populate('receiver')
                .populate('dialogue.sender')
                .populate('dialogue.receiver')
                .then((chat) => {
                    res.render('chatRoom', {chat:chat});
                }).catch((err) => {console.log(err)});

            }
        })
        

    }).catch((err) => {console.log(err)});
})

app.listen(port, () => {
    console.log(`Server is up on port ${port}`)
});