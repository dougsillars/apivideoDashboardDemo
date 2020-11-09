const queryString = window.location.search;
console.log(queryString);
const urlParams = new URLSearchParams(queryString);

const live = urlParams.get('live');
console.log("live?",live);
var framerate = 10;
var audioBitrate = 11025;
var width = 240;
var height = 240;
var livestreamTimeout = 15000;
var livestreamOk = true;
const prodDelegatedUrl ="https://ws.api.video/upload?token=to2XNb3D97DN6KkLgaEyKZ0k";
//vod variables
var chunkCounter =0;
//break into 10 MB chunks 
const chunkSize = 10000000;  
var videoId = "";
var playerUrl = "";
var start =0; 
var chunkEnd = start + chunkSize;
var filename= "";
var fileSize="";
var numberofChunks = 1;
var file;


if(live){
	
	var mediaRecorder;
 	//var socket =io();
 	var socket;
	
	var state ="stop";
	//console.log("state initiated = " +state); 
	connect_server();
   
    
   
      //onloadstuff
    window.onload = function(){
		//dragand drop for live
		dropVideo();
	
		
    //define the video player  and url 
    //only start the live player X seconds after starting recording
        setTimeout(function (){
     
			var liveManifest = document.getElementById("liveManifest").innerHTML;
			var liveResponse = document.getElementById("liveResponse").innerHTML;
			//{ "liveStreamId": "li2kvDGqdxa0q5AsOOBaGA1k", "streamKey": "3622465d-7de4-44ce-bc70-49b09484efb7", "name": "website live4", "record": false, "broadcasting": true, "assets": { "iframe": "<iframe src=\"https://embed.api.video/live/li2kvDGqdxa0q5AsOOBaGA1k\" width=\"100%\" height=\"100%\" frameborder=\"0\" scrolling=\"no\" allowfullscreen=\"\"></iframe>", "player": "https://embed.api.video/live/li2kvDGqdxa0q5AsOOBaGA1k", "hls": "https://live.api.video/li2kvDGqdxa0q5AsOOBaGA1k.m3u8", "thumbnail": "https://cdn.api.video/live/li2kvDGqdxa0q5AsOOBaGA1k/thumbnail.jpg" } }
			
			
			console.log("liveResponse",liveResponse);
			//<div id="liveManifest" style="display:none">https://live.api.video/li1kkTR1SwmEpuIZB2Dg9mBw.m3u8  </div>
			//liveManifest https://live.api.video/li2kvDGqdxa0q5AsOOBaGA1k.m3u8  
			var jsonResponse = JSON.parse(liveResponse);
			var videoId = jsonResponse.liveStreamId;
			console.log("jsonResponse",jsonResponse);
			//add player
			//No match found for selector result__videoWrapper
	        window.player = new PlayerSdk("#liveVideo", { 
	            id: videoId, 
	            live: true,
				autoplay:true,
				muted:true 
	        });
			
			//now we can enter the livestream JSON response... but only if the playback is ok
			//livestreamOk onlu fails if you dont give camera access - or if you use safarii
			if(livestreamOk){
				//place the JSON into the response area
				document.getElementsByClassName("result__server__body")[0].innerHTML = liveResponse;
			}
			//sometimes there is an error with video startup
			//and the  livestreamTimeout was not long enough.
			//insert a button to reload the video player
			//so we'll add a button that reloads the player

			var video = document.getElementById("videoRefresh");
			videoRefresh.innerHTML= "Refresh Live Video";
			videoRefresh.className = "videoRefresh";
			//videoRefresh.appendChild(refreshButton); 

			videoRefresh.addEventListener('click', function(){
				//refresh the video player by destroying and recreating it.
				player.destroy();
				console.log("destroyed");
		        window.player = new PlayerSdk("#liveVideo", { 
		            id: videoId, 
		            live: true,
					autoplay:true,
					muted:true 
		        });
				console.log("recreated");
				//this is the old way, that was problematic
				/*console.log("window.player",window.player);
				var iframeList = document.getElementsByTagName('iframe');
				console.log("iframeList", iframeList);
				
				iframeList[1].id = "liveVideoiframe";
				console.log("iframeList1", iframeList[1]);
				//adding empty space causes iframe to reload
				document.getElementById("liveVideoiframe").src +=' ';
				*/
			}
			);

          },livestreamTimeout);  
	  }
	
	

}else{
	
	//not live - either initial load or VOD
	window.onload = function(){
		dropVideo();
	}
		
}


///vod

function createChunk(videoId, file, start, end){
	chunkCounter++;
	console.log("created chunk: ", chunkCounter);
	chunkEnd = Math.min(start + chunkSize , file.size );
	filename = file.name;
	fileSize = file.size;
	console.log("filesize  written",filename+ fileSize);
	numberofChunks = Math.ceil(fileSize/chunkSize);
	const chunk = file.slice(start, chunkEnd);
	console.log("i created a chunk of video" + start + "-" + chunkEnd + "minus 1	");
  	const chunkForm = new FormData();
	if(videoId.length >0){
		//we have a videoId
		chunkForm.append('videoId', videoId);
		console.log("added videoId");	
		
	}
  	chunkForm.append('file', chunk, filename);
	console.log("added file");

	
	//created the chunk, now upload iit
	uploadChunk(chunkForm, start, chunkEnd);
}

function uploadChunk(chunkForm, start, chunkEnd){
	var oReq = new XMLHttpRequest();
	oReq.upload.addEventListener("progress", updateProgress);	
	oReq.open("POST", prodDelegatedUrl, true);
	var blobEnd = chunkEnd-1;
	var contentRange = "bytes "+ start+"-"+ blobEnd+"/"+fileSize;
	oReq.setRequestHeader("Content-Range",contentRange);
	console.log("Content-Range", contentRange);
	function updateProgress (oEvent) {
	    if (oEvent.lengthComputable) {  
	    var percentComplete = Math.round(oEvent.loaded / oEvent.total * 100);
		
		var totalPercentComplete = Math.round((chunkCounter -1)/numberofChunks*100 +percentComplete/numberofChunks);
	    document.getElementsByClassName("result__server__body")[0].innerHTML = "Chunk # " + chunkCounter + " is " + percentComplete + "% uploaded. Total uploaded: " + totalPercentComplete +"%";
		//console.log (percentComplete);
		// ...
	  } else {
		  console.log ("not computable");
	    // Unable to compute progress information since the total size is unknown
	  }
	}
	oReq.onload = function (oEvent) {
	               // Uploaded.
					console.log("uploaded chunk" );
					console.log("oReq.response", oReq.response);
					var resp = JSON.parse(oReq.response)
					videoId = resp.videoId;
					//playerUrl = resp.assets.player;
					console.log("videoId",videoId);
					
					//now we have the video ID - loop through and add the remaining chunks
					//we start one chunk in, as we have uploaded the first one.
					//next chunk starts at + chunkSize from start
					start += chunkSize;	
					console.log("start+ filesize",start+ " " +fileSize)
					chunkEnd = Math.min(start + chunkSize , fileSize );
					//if start is smaller than file size - we have more to still upload
					if(start<fileSize){
						//create the new chunk
						createChunk(videoId, chunkForm, start, chunkEnd);
					}
					else{
						//the video is fully uploaded. there will now be a url in the response
						console.log(JSON.stringify(resp));
						playerUrl = resp.assets.player;
						console.log("all uploaded! Watch here: ",playerUrl ) ;
						
						
						document.getElementsByClassName("result__server__body")[0].innerHTML = JSON.stringify(resp) ;
						document.getElementsByClassName("result__videoWrapper")[0].innerHTML = "<iframe id='videoPlayer' src='"+playerUrl+"#autoplay' height='100%' width='100%' crossorgin='anonymous'>"
					}
					
	  };
	  oReq.send(chunkForm);

	
	
}


 
function dropVideo(){
	
	let dropArea = document.getElementsByClassName("action__upload")[0];
	
     //prevent defaults on drop area
	dropArea.addEventListener('dragenter', preventDefaults, false);
	dropArea.addEventListener('dragleave', preventDefaults, false);
	dropArea.addEventListener('dragover', preventDefaults, false);
	dropArea.addEventListener('drop', preventDefaults, false);

	;['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
		dropArea.addEventListener(eventName, preventDefaults, false);
		console.log("prevented defaults");
	})


	function preventDefaults (e) {
	  e.preventDefault()
	  e.stopPropagation()
	}
	//if there is a dropped file
	dropArea.addEventListener('drop', handleDrop, false);
	function handleDrop(e) {
		let dt = e.dataTransfer;
		console.log("dt", dt);
		start =0;
		var chunkEnd = start + chunkSize;
		//the drop gives me a file list
		file = dt.files[0];
		console.log("filelist?",file);
   	 	
		//send this file to createChunk
		createChunk(videoId, file, start, chunkEnd);
	 
	  }
  }




 
 function thisFileUpload() {
    //get VOD video to upload
	 const fileElement = document.getElementById('file');
	 fileElement.click();
	 console.log('click');
	//upload file to NodeJS for upload to api.video
	fileElement.addEventListener("change", function() {	
		console.log("fileslist", fileElement.files);
	    console.log("file selected", document.getElementById('file').files[0]);
		//uploadForm.submit("/", method = 'POST',  enctype="multipart/form-data");
		uploadVideo(uploadForm);
		});

}

 function initiateLivestream() {
	 //set up livestream
	 //warm up the camera
	 connect_server();
	
	 livestreamForm.requestSubmit();
	
  }




function video_show(stream){
	console.log("videoshow");
	//console.log("output_video", output_video);
	if ("srcObject" in output_video) {
	//	console.log("videoshowif");
		output_video.muted = true;
		output_video.srcObject = stream;
		
	} else {
	//	console.log("videoshowelse");
		output_video.src = window.URL.createObjectURL(stream);
		
	}
  output_video.addEventListener( "loadedmetadata", function (e) {
	  console.log("outputvideoevent listener");
  		console.log(output_video);
		output_message.innerHTML="Local video source size:"+output_video.videoWidth+"x"+output_video.videoHeight ;
	}, false );
	//console.log("output_video", output_video);
}

function show_output(str){
	output_console+="\n"+str;
	console.log("response data",str);
	output_console.scrollTop = output_console.scrollHeight;
};

	function connect_server(){

		var socketio_address = "/";
		//console.log("connect server started");
		navigator.getUserMedia = (navigator.mediaDevices.getUserMedia ||
                          navigator.mediaDevices.mozGetUserMedia ||
                          navigator.mediaDevices.msGetUserMedia ||
						  navigator.mediaDevices.webkitGetUserMedia);
		console.log("navigator.getUserMedia", navigator.getUserMedia);
		if(!navigator.getUserMedia){fail('No getUserMedia() available.');}
		
        
		var socketOptions = {secure: true, reconnection: true, reconnectionDelay: 1000, timeout:15000, pingTimeout: 			15000, pingInterval: 45000,query: {framespersecond: framerate, audioBitrate: audioBitrate}};
		
		//start socket connection
		console.log("socket address", socketio_address);
		socket = io.connect(socketio_address, socketOptions);
		console.log("socket", socket);
		// console.log("ping interval =", socket.pingInterval, " ping TimeOut" = socket.pingTimeout);
 		//output_message.innerHTML=socket;
		
		socket.on('connect_timeout', (timeout) => {
   			console.log("state on connection timeout= " +timeout);
			output_message.innerHTML="Connection timed out";
			//recordingCircle.style.fill='gray';
			
		});
		socket.on('error', (error) => {
   			console.log("state on connection error= " +error);
			output_message.innerHTML="Connection error";
		//	recordingCircle.style.fill='gray';
		});
		
		socket.on('connect_error', function(){ 
   			console.log("state on connection error= " +state);
			console.log("Connection Failed");
			output_message.innerHTML="Connection Failed";
		//	recordingCircle.style.fill='gray';
		});

		socket.on('message',function(m){
			console.log("state on message= " +state);
			console.log('recv server message',m);
			output_message.innerHTML+=('SERVER:'+m);
			
		});

		socket.on('fatal',function(m){

			output_message.innerHTML+=('Fatal ERROR: unexpected:'+m);
			//alert('Error:'+m);
			console.log("fatal socket error!!", m);
			console.log("state on fatal error= " +state);
			//already stopped and inactive
			console.log('media recorder restarted');
			//recordingCircle.style.fill='gray';
			
			//mediaRecorder.start();
			//state="stop";
			//restart the server
	
		
			//should reload?
		});
		
		socket.on('ffmpeg_stderr',function(m){
			//this is the ffmpeg output for each frame
			output_message.innerHTML+=('FFMPEG:'+m);	
		});

		socket.on('disconnect', function (reason) {
			console.log("state disconec= " +state);
			output_message.innerHTML+=('ERROR: server disconnected!');
			console.log('ERROR: server disconnected!' +reason);
			
			//error message to users
			//document.getElementsByClassName("result__server__body")[0].innerHTML
			document.getElementsByClassName("result__server__body")[0].innerHTML="This demo requires a steady internet connection with a fast upload rate. Please try again later.";
					
	
		});
	
		state="ready";
		console.log("connected state = " +state);
		console.log("connect server successful");
	//	output_message.innerHTML="connect server successful";
		requestMedia();
}
function requestMedia(){
/*	var audioBitrate = 11025;
	var width = 240;
	var height = 240;
	var framerate = 15;
	*/
	console.log("request media");
	var constraints = { audio: {sampleRate: audioBitrate},
						video:{
		        			width: { min: 100, ideal: width, max: 1920 },
		       			 	height: { min: 100, ideal: height, max: 1080 },
		        			frameRate: {ideal: framerate}
		    			}
					};
	console.log(constraints);
	navigator.getUserMedia = (navigator.mediaDevices.getUserMedia ||
                      navigator.mediaDevices.mozGetUserMedia ||
                      navigator.mediaDevices.msGetUserMedia ||
                      navigator.mediaDevices.webkitGetUserMedia);
	navigator.mediaDevices.getUserMedia(constraints).then(function(stream) {
		console.log("settings", stream);
		
		//let supported = navigator.mediaDevices.getSupportedConstraints();
		//console.log("supported details", supported);
		//console.log("chose the camera");
		//removed for production
		//to see local video add a class video_show to the page
		//video_show(stream);//only show locally, not remotely
		//recordingCircle.style.fill='red';
		//socket.emit('config_rtmpDestination', url);
		socket.emit('start','start');
		mediaRecorder = new MediaRecorder(stream);
		mediaRecorder.start(250);

		//show remote stream
		var livestream = document.getElementsByClassName("Livestream");
		console.log("adding live stream");
		livestream.innerHtml = "test";

		mediaRecorder.onstop = function(e) {
			console.log("stopped!");
			console.log(e);
			//stream.stop();
				
		}
		
		mediaRecorder.onpause = function(e) {
			console.log("media recorder paused!!");
			console.log(e);
			//stream.stop();
				
		}
		
		mediaRecorder.onerror = function(event) {
			let error = event.error;
			console.log("error", error.name);

  	  };	
		
		mediaRecorder.ondataavailable = function(e) {
		//  console.log("ondataavailable");
		  socket.emit("binarystream",e.data);
		  state="start";
		  //chunks.push(e.data);
		}
	}).catch(function(err) {
		//console.log('The following error occured: ' + err);
		//this goes to the 
		//show_output('Live stream error:'+err);
		console.log('Live stream error:'+err);
		console.log(err);
		var error ="unknown";
		var errorMessage = "Sorry, an unknown error occurred.";
		var blackbox = document.getElementsByClassName("result__server__body");
		//there is only one element with the class result__server__body
		if(err.message){
			error = err.message;
		}
		console.log("error", error);
		if(error.includes("MediaRecorder")){
			console.log("error", error);
			//getUserMedia is not supported in the browser (probably safari)
			errorMessage="Sorry, but your browser does not support the MediaRecorder API required for live streaming.  Please try Firefox, Chrome or Edge.";
		}else if("The request is not allowed"){
			errorMessage="Sorry, but you must allow camera and microphone access to record video.";
			
		}
		//livestream is not ok :(
		livestreamOk = false;
		console.log("errorMessage", errorMessage);
		blackbox[0].innerHTML=errorMessage;
		 state="stop";
		 stopStream;
		
	});
}


function stopStream(){
	  	console.log("stop pressed:");
	  	//stream.getTracks().forEach(track => track.stop())
	  	mediaRecorder.stop();
	 // 	recordingCircle.style.fill='gray';

}