// server.js

// modules =================================================
var express        = require('express');  
var app            = express();
var later          = require('later');
var Async = require('async');
var YouTube = require('youtube-node');
var youTube = new YouTube();
youTube.setKey('AIzaSyC8cU2wC_I1MxQ70AJF7o65hCSzCifyOtE');
var firebase       = require("firebase");
var Playlists = require('./config/playlists');

var consoleTag = '[VIDEO]: ';
var locked = false;

// set our port
var port = process.env.PORT || 3000;

// set the static files location for our Ember application
app.use(express.static(__dirname + '/public'));


//
firebase.initializeApp({
  serviceAccount: "./config/lolvideo-d12f0-firebase-adminsdk-y13d0-a8adba59dd.json",
  databaseURL: "https://lolvideo-d12f0.firebaseio.com"
});

//Routes API
var router = express.Router();  
app.use('/', router);  
require('./app/routes')(router); // configure our routes

// startup our app at http://localhost:3000
app.listen(port);

var textSched = later.parse.text('every 1 min');

var timer2 = later.setInterval(function() {
    refreshVideos();
}, textSched);

var refreshVideos = function() {
    var db = firebase.database();
    var ref = db.ref('/videos');
    console.log('over here');
    ref.once("value", function(vids) {
        startSeries(vids);
    });
};

function recurseNextPages(pt, playlistID, plid, cvl, callback) {
    var pageTokens = [{
        id: pt
    }];
    var nextPage = null;

    var videos = firebase.database().ref('/videos');

    locked = true;
    Async.eachOfSeries(pageTokens, function (pageT, ind, cb) {

        youTube.addParam('pageToken', pageT.id);
        youTube.getPlayListsItemsById(playlistID, function (error, result) {
            if (error) {
                console.log(consoleTag + "ERROR1: " + error);
            } else {
                Async.eachOfSeries(result.items, function (item, ind2, cb2) {
                    var found = false;
                    for(var a in cvl.val()) {
                        if (cvl.val()[a].id == item.snippet.resourceId.videoId) {
                            found = true;
                            break;
                        }
                    }
                    if (found) {
                        console.log('found');
                        cb2();
                    } else {
                        console.log('not found');
                        videos.push(videoModel(
                            item.snippet.resourceId.videoId, 
                            item.snippet.title,
                            plid.name,
                            plid.year,
                            0,
                            0,
                            plid.region,
                            new Date(item.snippet.publishedAt).getTime()
                        ), function(done) {
                            cb2();
                        });
                    }
                }, function(err) {
                    if (result.nextPageToken) {
                        nextPage = result.nextPageToken;
                    }
                    cb();
                });
            }
        });
    }, function(err) {
        if (err) {
            console.log(err);
        }
        if (nextPage) {
            console.log("Found another page also: " + nextPage);
            recurseNextPages(nextPage, playlistID, plid, cvl, callback);
        } else {
            locked = false;
            callback();
        }
    });
}

function startSeries(cvl) {
    if (locked) {
        return;
    }
    //Connecting to firebase
    var videos = firebase.database().ref('/videos');

    locked = true; //Locking for firebase push issue
    Async.eachOfSeries(Playlists.playlistIds, function (plid, ind, cb) {
        if (plid.done) {
            cb();
        } else {
            console.log(plid.name + '-' + plid.region);
            
            youTube.addParam('maxResults', '50');
            youTube.addParam('pageToken', null);
            youTube.getPlayListsItemsById(plid.id, function (error, result) {
                if (error) {
                    console.log(consoleTag + 'ERROR: ' + error);
                } else {

                    Async.eachOfSeries(result.items, function (item, ind2, cb2) {
                        var found = false;
                        for(var a in cvl.val()) { //Saved already?
                            if (cvl.val()[a].id == item.snippet.resourceId.videoId) {
                                found = true;
                                break;
                            }
                        }
                        if (found) {
                            console.log('found');
                            cb2();
                        } else {
                            locked = true;
                            console.log('not found');
                            videos.push(videoModel(
                                item.snippet.resourceId.videoId, 
                                item.snippet.title,
                                plid.name,
                                plid.year,
                                0,
                                0,
                                plid.region,
                                new Date(item.snippet.publishedAt).getTime()
                            ), function(done) {
                                cb2();
                            });
                        }
                    }, function(err) {
                        if (result.nextPageToken) {
                            console.log(result.nextPageToken);
                            recurseNextPages(result.nextPageToken, plid.id, plid, cvl, cb);
                        } else {
                            cb();
                        }
                    });
                }
            });
        }
    }, function(err) {
        console.log(consoleTag + "DONE VIDEO REFRESH");
        locked = false;
    });
}

// expose app
exports = module.exports = app;