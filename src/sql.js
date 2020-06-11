    //mysql for the productID -> api key in the dashboard demo
     var {Client} = require('pg');
    
     var productIdSandbox = "prUMsehoEjCfbzxl1eeV00I";
    //now we have the productId for sand box and production
	//lookup the api keys in the database
	const client = new Client({
        host: 'psql.api.video',
        user: 'libcast',
        Schema: public,
        database: 'subscription',
        password: 'secretpassword',
        port: 3211,
      })
      client.connect()
      client.query('SELECT value from public.api_key where project_id = '+ productIdSandbox, (err, res) => {
        console.log(err, res)
        client.end()
      })
     