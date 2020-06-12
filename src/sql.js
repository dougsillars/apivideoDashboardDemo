    //mysql for the productID -> api key in the dashboard demo
    const pg = require('pg');
    
     var productIdSandbox = "prUMsehoEjCfbzxl1eeV00I";
    //now we have the productId for sand box and production
	//lookup the api keys in the database
	const pool = new pg.Pool({
        user: 'libcast',
        host: 'psql.api.video',
        Schema: 'public',
        database: 'subscription'
      });

      const query = {
        name: "get api key",  
        text: 'SELECT value from public.api_key where project_id = \''+ productIdSandbox +'\''
      }

      pool.query(query, (err, res) => {
            console.log(err,res);
            pool.end;
      });
 
