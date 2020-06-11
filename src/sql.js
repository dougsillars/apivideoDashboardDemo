    //mysql for the productID -> api key in the dashboard demo
     var mysql = require('mysql');
    
     var productIdSandbox = prUMsehoEjCfbzxl1eeV00I;
    //now we have the productId for sand box and production
	//lookup the api keys in the database
	var con = mysql.createConnection({
		host: "psql.api.video",
		user: "libcast",
		database: "subscription"
	  });

	  con.connect(function(err) {
		if (err) throw err;
		con.query("SELECT value from public.api_key where project_id ="+ productIdSandbox, function (err, result, fields) {
		  if (err) throw err;
		  console.log("sql query", result);
		});
	  });
	