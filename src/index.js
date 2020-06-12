import 'dotenv/config';
import express from 'express';

//express for the website and pug to create the pages
const app = express();
const pug = require('pug');
var server = require('http').createServer(app);
var io = require('socket.io')(server);
var rtmpEndpoint;
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine','pug');
app.use(express.static('public'));
//favicons are the cool little icon in the browser tab
var favicon = require('serve-favicon');
app.use(favicon('public/icon.ico')); 
//app.use(express.limit('2G'));
var bodyParser = require('body-parser')
app.use(bodyParser.json({limit: '2Gb'}));

//placeholder image for the iframe
var placeholderImage = "/pont.jpg";
var iframecode = placeholderImage;
var liveStreamManifest;
//var iframecode = "img src='"+placeholderImage+"' width='100%'";

//formidable takes the form data and saves the file, and parameterises the fields into JSON
const formidable = require('formidable')
//email-validator to validate the email address
var validator = require("email-validator");

//postgressql for the productID -> api key in the dashboard demo
const pg = require('pg');
const pool = new pg.Pool({
	user: 'libcast',
	host:'psql.api.video',
	Schema:'public',
	database:'subscription'
});


//ctreate timers to measure upload and processing timings
    let startUploadTimer;
	let uploadCompleteTimer;
	let playReadyTimer;
	
	
//file system - we need this to delete files after they are uploaded.
var fs = require('fs');
//apivideo
const apiVideo = require('@api.video/nodejs-sdk');

//apikeys
var apiVideoSandbox="";
var apiVideoProduction = "";
var productIdSandbox = "";
var productIdProduction = "";


//for the homepage demo - there is logic to serve streams from Canada.
//by default it is EU
var canadaHost = "broadcast-demo-ca-01";


//by default. assume that we'll use the sandbox, and that no prod is avaul
var useSandbox=true;
var productionAvailable=false;

//initially sandbox only
var client = new apiVideo.Client({ apiKey: apiVideoSandbox});






//get request is the initial request - loads the start.pug
//start.pug has the form
app.get('/dashboard', (req, res) => {
	console.log("get index loaded", req.query);
	var live = req.query.live;
	
	//get the productIDs and convert to API keys - only needed on get for first load
	//not present on subsequent loads...

	//we only need to do this if there is a sandbox product ID GET param.  
	//There is not a reason for there to be a prod but no sandbox.
	if(req.query.sandbox){
		//we got sandbox productID key!!
		productIdSandbox = req.query.sandbox;
		useSandbox=true;
		console.log("sandbox", productIdSandbox);

		
	}
	if(req.query.production){
			//we got prod productID key
			productIdProduction = req.query.production;
			productionAvailable = true;
			//if prod is available - default is to stream and upload to prod
			useSandbox=false;
			console.log("productIdProduction", productIdProduction);

	}
		//get sandbox key
		const querySandbox = {
			name: "get sandbox apikey",
			text:"SELECT value FROM public.api_key where api_key.product_id =\'" +productIdSandbox+'\''
		}
		console.log(querySandbox.text);
		pool.query(querySandbox, (err, res) => {
            console.log(err,res);
            pool.end;
      	});


		pool.query(querySandbox, (err, res) => {
			console.log("response", res);
			apiVideoSandbox = res.rows[0].values;
			console.log("apiVideoSandbox", apiVideoSandbox);
			pool.end;
		//now get production key
		const queryProduction = {
			name: "get production apikey",
			text:"SELECT value FROM public.api_key where api_key.product_id =\'" +productIdProduction+'\''
		}
			pool.query(queryProduction, (err, res) => {
				apiVideoProduction = res.rows[0].values;
				console.log("apiVideoProduction", apiVideoProduction);
				pool.end;

				//now I have both api keys... I can continue down the path I had before
				//on subsequent loads - sandbox is chosen by the customer.
				//use sandbox or prod
				if(req.query.livesandbox == "false"){
					//use production
					useSandbox = false;

					console.log("production!!");
				}else if(req.query.livesandbox == "true"){
					useSandbox = true;
					console.log("sandbox!!");
				}
				//now set the api client
				if(useSandbox){
					client = new apiVideo.Client({ apiKey: apiVideoSandbox});
				}else{
					client = new apiVideo.Client({ apiKey: apiVideoProduction});
				}
				
				console.log("use sandbox?", useSandbox);
				console.log("client", client);
				
				
				console.log("productionAvailable", productionAvailable);
				//Just sandbox right now
				
				

				if(live){
					//we have to add a livestream!
					console.log("live!");
					//live & socket stuff
					var spawn = require('child_process').spawn;
					const server = require('http').createServer(app);
					var io = require('socket.io')(server);
					spawn('ffmpeg',['-h']).on('error',function(m){
						console.error("FFMpeg not found in system cli; please install ffmpeg properly or make a softlink to ./!");
						process.exit(-1);
					});
					//set up a  RTMP server from the list
					//list of streams from api.video
					//see if there are livestreams already created with the name DashboardLive
					let streamList = client.lives.search({name:"DashboardLive"});	
						//there will eitehr be one.. or not.
						streamList.then(function(streams) {
							if(streams.length >0 ){
								console.log("found existing livestream", streams);
								// run function to return stream
								publishLiveStream(streams);
						
							}else{
								let newStream = client.lives.create('DashboardLive');
								newStream.then(function(streams){
									console.log("creating new livestream", streams);
									// run function to return stream
									publishLiveStream(streams);
								});
							}

				
						});	
				
						function publishLiveStream(streams){
							console.log(streams);	
						var streamId;
						var streamKey;
						//i only want one stream...  having a nested JSON screws up other stuff
						if(streams[0]){
							streams = streams[0];
						}
						streamKey = streams.streamKey;
						streamId = streams.liveStreamId;
						console.log( streamKey,streamId);
						rtmpEndpoint = "rtmp://broadcast.api.video/s/"+streamKey;
						console.log("rtmp endpoint",rtmpEndpoint );
						var streamUrl = "https://live.api.video/" + streamId;
						liveStreamManifest = streamUrl+".m3u8";
						//api response says "broadcasting:false". let's fix that
						streams.broadcasting = true;

						//the API response needs to be a string
						var  liveResponse = JSON.stringify(streams,null, 2);
						//in addition to sending the API response, we should havea. placeholder message while the video buffersup
						var  videoResponse = "Your Livestream will start in a few seconds..."

						//finally - the iframecode is not an iframe, but for videojs
						iframecode = "iframe width='0' height='0' style='display:none'";

						console.log(iframecode);
						//we should not reyurn the page until broadcasting is true
						//but broadcasting cant be true until the camera starts - ehich requires the page!

			
						return res.render('dashboardindex', { videoResponse, rtmpEndpoint, liveStreamManifest, liveResponse, useSandbox, productionAvailable});   	 		}
					
				}else{
					//reset to default image
					iframecode = "img src="+placeholderImage;
					var videoResponse = "When you upload a video, the API response will appear here."
					//not live..just loading the page
					console.log("default page", iframecode);
					return res.render('dashboardindex', {iframecode, videoResponse, useSandbox, productionAvailable});
				}
				

			});
		});
  
});




//the form posts the data to the same location
//so now we'll deal with the submitted data
app.post('/dashboard', (req,res) =>{

    //formidable reads the form
	var form = new formidable.IncomingForm({maxFileSize : 2000 * 1024 * 1024}); //2 Gb
	//console.log("form",form);
	//use .env feil to set the directory for the video uploads
	//since we will be deleting the files after they uplaod to api.video
	//make sure this directory is full write and delete
	form.uploadDir = process.env.videoDir;
    
	//TODO form validation (mp4 file type, etc)
	form.parse(req, (err, fields, files) => {
   		if (err) {
			console.log(err);
			next(err);
			return;
		}
	});
	//testing - writing fields and info on the file to the log
	   // console.log('Fields', fields);
  	//  console.log('Files', files.source);
  	//Just sandbox right now

	//use sandbox or prod
  
  
  
  
  
 	console.log("fields ",fields); 
	console.log("fields livesandbox",fields.vodsandbox);
if(fields.vodsandbox == "false"){
	//use production
	useSandbox = false;
}else{
	useSandbox = true;
}
console.log("use sandbox?", useSandbox);

//now set the api client
if(useSandbox){
	client = new apiVideo.Client({ apiKey: apiVideoSandbox});
}else{
	client = new apiVideo.Client({ apiKey: apiVideoProduction});
}


	var date = new Date();
	var videoTitle = date.getTime();
	//uploading.  Timers are for a TODO measuring upload & parsing time
	startUploadTimer = Date.now();
	console.log("start upload", startUploadTimer);
	let result = client.videos.upload(files.source.path, {title: videoTitle});
	
	//the result is the upload response
	//see https://docs.api.video/5.1/videos/create-video
	//for JSON details
	result.then(function(video) {
		uploadCompleteTimer = Date.now();
		console.log("upload complete", uploadCompleteTimer);
		//console.log("video",video);
		var videoJson = JSON.stringify(video, null, 2);
	   //delete file on node server
		fs.unlink(files.source.path, function (err) {
    	if (err) throw err;
    	// if no error, file has been deleted successfully
    	console.log('File deleted!');
		}); 
      //video is uploaded, but not yet published.	
	  //check video status until it is published
	  //when video is playable return the video page
	  videoStatus(video);
		 //this means that the video is now playable
		  //so load video.pug, to display the video to the user.
	  function videoStatus(video) {
	  	//get info about video
	  	let videoId = video.videoId;
	  	let iframe  = video.assets.iframe;
		let player = video.assets.player;
	  	let playable = false;
	  	let status = client.videos.getStatus(videoId);
	      status.then(function(videoStats){
	      	//console.log('status', status);
			//we have the video uploaded, now we need to wait for encoding to occur
	  		playable = videoStats.encoding.playable;
	  		console.log('video playable?',videoStats.encoding.playable, playable);
	  		if (playable){
	  			//video is ready to be played
				//and we can get the mp4 url now as well
	  			console.log("ready to play the video");
	  			playReadyTimer = Date.now();
				let uploadSeconds = (uploadCompleteTimer-startUploadTimer)/1000;
				let processSeconds = (playReadyTimer - uploadCompleteTimer)/1000;
				console.log("video uploaded in: ", uploadSeconds);
				console.log("video processed in: ", processSeconds);
	  			//now we can get the MP4 url, and send the email and post the response
				//now we add the tags to let zapier know it s ready to go
				
				var videoResponse = "<a href='"+player+"' target='_blank'> Your Video is ready!</a>";
				console.log("videoResponse", videoResponse);
				
			
	  		   return res.render('dashboardindex', {videoResponse, useSandbox, productionAvailable});
		   	 		
	  		}else{
	  			//not ready so check again in 2 seconds.
	  			console.log("not ready yet" );
	  			setTimeout(videoStatus(video),2000);
	  		}

			
			
	  	}).catch(function(error) {
	  	  console.error(error);
	  	});;	
	  }  
	  
	  
      
	  
	  
	//if upload fails  
	}).catch(function(error) {
	  console.error(error);
	});
	
//	console.log(result.response);


});


// website demo
//get request is the initial request - loads the start.pug
//start.pug has the form
app.get('/', (req, res) => {
	var client = new apiVideo.Client({ apiKey: process.env.apivideoKeyProd});
	var remoteIp = req.ip;
	console.log("get index loaded", remoteIp);
	var live = req.query.live;
	if(live){
		//we have to add a livestream!!	
		console.log("live!");
		//live & socket stuff
		var spawn = require('child_process').spawn;
		const server = require('http').createServer(app);
		var io = require('socket.io')(server);
		spawn('ffmpeg',['-h']).on('error',function(m){
			console.error("FFMpeg not found in system cli; please install ffmpeg properly or make a softlink to ./!");
			process.exit(-1);
		});
		//set up a  RTMP server from the list
		//list of streams from api.video
		//for the homepage demo - we have 10 RTMP servers in canada and 10 in France to lower latency
		//where are we?
		var os = require("os");
		var hostName = os.hostname();
		console.log("hostName", hostName);
		
		//there are 10 enpoints in EU with the name "live"
		//this is the default
		var nameSearch = "live";
		//there are 10 endpoints in NA with the name Canada
		//if using canada server, use the to canada endpoints 
		if (hostName == canadaHost){
			//host ins in canada
			//search for streams with name canada
			nameSearch = "canada";
		}
		
		
		console.log("nameSearch", nameSearch);
		//
		let streamList = client.lives.search({"name": nameSearch});	
		streamList.then(function(streams) {
			//console.log(streams);
			let streamCount = streams.length;
			var streamKey;
			var streamId;
			// loop throigh all the available streams, and make sure that it is not broadcasting
			var counter =0;
			let chosenStream = streamPicker(streams,counter);
			console.log("stream chosen",streams[chosenStream]);
			if (chosenStream <0){
				//all the streams are in use
				//no streams are availabe
				var videoResponse = "All the test streams are in use. Please try again later."
				return res.render('index', {iframecode, videoResponse, rtmpEndpoint});
			}else{
				//valid stream
				streamKey = streams[chosenStream].streamKey;
				streamId = streams[chosenStream].liveStreamId;
				//this is correct for standard connections.. for the website demo - we are using a different endpoint
				//rtmpEndpoint = "rtmp://broadcast.api.video/s/"+streamKey;
				
				//use this endpoint *just* for the website demo
				console.log("hostName", hostName);
				if(hostName == "Dougs-MBP"){
					rtmpEndpoint = "rtmp://broadcast.api.video/s/"+streamKey;
					
				} else{
				
				 	rtmpEndpoint = "rtmp://127.0.0.1:1935/s/"+streamKey;
				}
				console.log("rtmp endpoint",rtmpEndpoint );
			}
			//we've esablished the stream, we want to use, so connect the id with the bas url
			var streamUrl = "https://live.api.video/" + streamId;
			
			//livestream manifest url:
		    liveStreamManifest = streamUrl+".m3u8";
			//
			//api response says "broadcasting:false". let's fix that
			streams[chosenStream].broadcasting = true;
			
			//the API response needs to be a string
			var  liveResponse = JSON.stringify(streams[chosenStream],null, 2);
			//in addition to sending the API response, we should havea. placeholder message while the video buffersup
			var  videoResponse = "Your Livestream will start in a few seconds..."
			
			//finally - the iframecode is not an iframe, but for videojs
			iframecode = "iframe width='0' height='0' style='display:none'";
			
			console.log(iframecode);
			//we should not reyurn the page until broadcasting is true
			//but broadcasting cant be true until the camera starts - ehich requires the page!
			
			//set a timeout
           				
			return res.render('index', {iframecode, videoResponse, rtmpEndpoint, liveStreamManifest, liveResponse});   	 		

		});
		
		
		
		
	}else{
	    //reset to default image
		//iframecode = "img src="+placeholderImage;
		//globe video
		let player = "https://embed.api.video/vod/vi5oDagRVJBSKHxSiPux5rYD";
		iframecode = "iframe id='videoPlayer', src='"+player+"#autoplay;loop', height='100%', width='100%'";
		
		var videoResponse = "When you upload a video, the API response will appear here."
		//not live..just loading the page
		console.log("default page", iframecode);
		return res.render('index', {iframecode, videoResponse});
	}
	
  
});

//the form posts the data to the same location
//so now we'll deal with the submitted data
app.post('/', (req,res) =>{
	var client = new apiVideo.Client({ apiKey: process.env.apivideoKeyProd});
	
    //formidable reads the form
	var form = new formidable.IncomingForm({maxFileSize : 2000 * 1024 * 1024}); //2 Gb
	//console.log("form",form);
	//use .env feil to set the directory for the video uploads
	//since we will be deleting the files after they uplaod to api.video
	//make sure this directory is full write and delete
	form.uploadDir = process.env.videoDir;
    
	//TODO form validation (mp4 file type, etc)
	form.parse(req, (err, fields, files) => {
    if (err) {
		console.log(err);
		next(err);
		return;
    }
	//testing - writing fields and info on the file to the log
   // console.log('Fields', fields);
  //  console.log('Files', files.source);
	
	var date = new Date();
	var videoTitle = date.getTime();
	//uploading.  Timers are for a TODO measuring upload & parsing time
	startUploadTimer = Date.now();
	console.log("start upload", startUploadTimer);
	let result = client.videos.upload(files.source.path, {title: videoTitle});
	
	//the result is the upload response
	//see https://docs.api.video/5.1/videos/create-video
	//for JSON details
	result.then(function(video) {
		uploadCompleteTimer = Date.now();
		console.log("upload complete", uploadCompleteTimer);
		//console.log("video",video);
		var videoJson = JSON.stringify(video, null, 2);
	   //delete file on node server
		fs.unlink(files.source.path, function (err) {
    	if (err) throw err;
    	// if no error, file has been deleted successfully
    	console.log('File deleted!');
		}); 
      //video is uploaded, but not yet published.	
	  //check video status until it is published
	  //when video is playable return the video page
	  videoStatus(video);
		 //this means that the video is now playable
		  //so load video.pug, to display the video to the user.
	  function videoStatus(video) {
	  	//get info about video
	  	let videoId = video.videoId;
	  	let iframe  = video.assets.iframe;
		let player = video.assets.player;
	  	let playable = false;
	  	let status = client.videos.getStatus(videoId);
	      status.then(function(videoStats){
	      	//console.log('status', status);
			//we have the video uploaded, now we need to wait for encoding to occur
	  		playable = videoStats.encoding.playable;
	  		console.log('video playable?',videoStats.encoding.playable, playable);
	  		if (playable){
	  			//video is ready to be played
				//and we can get the mp4 url now as well
	  			console.log("ready to play the video");
	  			playReadyTimer = Date.now();
				let uploadSeconds = (uploadCompleteTimer-startUploadTimer)/1000;
				let processSeconds = (playReadyTimer - uploadCompleteTimer)/1000;
				console.log("video uploaded in: ", uploadSeconds);
				console.log("video processed in: ", processSeconds);
	  			//now we can get the MP4 url, and send the email and post the response
				//now we add the tags to let zapier know it s ready to go
				
				var videoResponse = "Video uploaded in: "+ uploadSeconds+"s \n Video processed in: " + processSeconds +"s \n "+videoJson;
				console.log("videoResponse", videoResponse);
				iframecode = iframecode = "iframe id='videoPlayer', src='"+player+"#autoplay', height='100%', width='100%'";

				console.log(iframecode);
				
			
	  		   return res.render('index', {iframecode, videoResponse});
		   	 		
	  		}else{
	  			//not ready so check again in 2 seconds.
	  			console.log("not ready yet" );
	  			setTimeout(videoStatus(video),2000);
	  		}

			
			
	  	}).catch(function(error) {
	  	  console.error(error);
	  	});;	
	  }  
	  
	  
      
	  
	  
	//if upload fails  
	}).catch(function(error) {
	  console.error(error);
	});
	
//	console.log(result.response);


});
});



//streaming stuff
var spawn = require('child_process').spawn;

spawn('ffmpeg',['-h']).on('error',function(m){

	console.error("FFMpeg not found in system cli; please install ffmpeg properly or make a softlink to ./!");
	process.exit(-1);
});
io.on('connection', function(socket){
	console.log("connection");
	socket.emit('message','Hello from mediarecorder-to-rtmp server!');
	socket.emit('message','Please set rtmp destination before start streaming.');
	console.log('message','Hello from mediarecorder-to-rtmp server!');
	console.log('message','Please set rtmp destination before start streaming.');
	
	
	
	var ffmpeg_process, feedStream=false;


	//socket._vcodec='libvpx';//from firefox default encoder
	socket.on('config_vcodec',function(m){
		if(typeof m != 'string'){
			socket.emit('fatal','input codec setup error.');
			
			return;
		}
		if(!/^[0-9a-z]{2,}$/.test(m)){
			socket.emit('fatal','input codec contains illegal character?.');
			return;
		}//for safety
		socket._vcodec=m;
	}); 	


	socket.on('start',function(m){
		if(ffmpeg_process || feedStream){
			
			socket.emit('fatal','stream already started.');
			console.log('fatal','stream already started.');
			return;
		}
		if(!rtmpEndpoint){
			socket.emit('fatal','no destination given.');
			console.log('fatal','no destination given.');
			return;
		}
		
		var framerate = parseInt(socket.handshake.query.framespersecond);
		var audioBitrate = parseInt(socket.handshake.query.audioBitrate);
	    var audioEncoding = "64k";
		if (audioBitrate ==11025){
			audioEncoding = "11k";
		} else if (audioBitrate ==22050){
			audioEncoding = "22k";
		} else if (audioBitrate ==44100){
			audioEncoding = "44k";
		}
		console.log("audio numbers" , audioEncoding, audioBitrate);
		console.log("apivideo server", rtmpEndpoint);
		//default keyint is 250. but we want 2 for 1fps
		var key = Math.min(250, framerate*2);
		var keyint = "keyint="+key;
		//keyint_min default is 25
		var keyint_min = Math.min(25, framerate*2);
			var ops = [
				'-i','-',
				 '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', 
				//'-max_muxing_queue_size', '1000', 
				//'-bufsize', '5000',
				//'-r', '1', '-g', '2', '-keyint_min','2', 
			       '-r', framerate, '-g', framerate*2, '-keyint_min',keyint_min, 
					'-x264opts',keyint, '-crf', '25', '-pix_fmt', 'yuv420p',
			        '-profile:v', 'baseline', '-level', '3', 
     				'-c:a', 'aac', '-b:a',audioEncoding, '-ar', audioBitrate, 
			        '-f', 'flv', rtmpEndpoint		
		
		];
	
	    console.log("ops", ops);
		console.log("rtmp endpoint", rtmpEndpoint);
		ffmpeg_process=spawn('ffmpeg', ops);
		console.log("ffmpeg spawned");
		feedStream=function(data){
			
			ffmpeg_process.stdin.write(data);
			//write exception cannot be caught here.	
		}

		ffmpeg_process.stderr.on('data',function(d){
			socket.emit('ffmpeg_stderr',''+d);
			console.log('ffmpeg_stderr',''+d);
		});
		ffmpeg_process.on('error',function(e){
			console.log('child process error'+e);
			socket.emit('fatal','ffmpeg error!'+e);
			feedStream=false;
			socket.disconnect();
		});
		ffmpeg_process.on('exit',function(e){
			console.log('child process exit'+e);
			socket.emit('fatal','ffmpeg exit!'+e);
			socket.disconnect();
		});
	});

	socket.on('binarystream',function(m){
		if(!feedStream){
			socket.emit('fatal','rtmp not set yet.');
			console.log('fatal','rtmp not set yet.');
			ffmpeg_process.stdin.end();
			ffmpeg_process.kill('SIGINT');
			return;
		}
		feedStream(m);
	});
	socket.on('disconnect', function () {
		console.log("socket disconected!");
		feedStream=false;
		if(ffmpeg_process)
		try{
			ffmpeg_process.stdin.end();
			ffmpeg_process.kill('SIGINT');
			console.log("ffmpeg process ended!");
		}catch(e){console.warn('killing ffmpeg process attempt failed...');}
	});
	socket.on('error',function(e){
		
		console.log('socket.io error:'+e);
	});
});

io.on('error',function(e){
	console.log('socket.io error:'+e);
});




//streaming stuff





//testing on 3002
server.listen(3002, () =>
  console.log('Example app listening on port 3002!'),
);
process.on('uncaughtException', function(err) {
    // handle the error safely
    console.log(err)
    // Note: after client disconnect, the subprocess will cause an Error EPIPE, which can only be caught this way.
})

function streamPicker(streams, counter){
	console.log("counter", counter);
	var chosenStream = -1;
	let streamCount = streams.length;
	//console.log(streams);
	console.log("streamcount", streamCount);
	let randomNumber = Math.floor(Math.random()*streamCount);
	console.log("is broadcasting: ", streams[randomNumber].broadcasting);
	//console.log("streampicking", streams[randomNumber]);
	for(var i=0;i<streamCount;i++){
		if(!streams[i].broadcasting){
			//not broadcasting, choose this one
			chosenStream = i;
		}
	}
	
	console.log("streamPicker stream chosen", chosenStream);
	return chosenStream;
	
}




