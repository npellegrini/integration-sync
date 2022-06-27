/**
 * This exercise has you implement a synchronize() method that will
 * copy all records from the sourceDb into the targetDb() then start
 * polling for changes. Places where you need to add code have been
 * mostly marked and the goal is to get the runTest() to complete
 * successfully.
 * 
 *
 * Requirements:
 *
 * Try to solve the following pieces for a production system. Note,
 * doing one well is better than doing all poorly. If you are unable to
 * complete certain requirements, please comment your approach to the 
 * solution. Comments on the "why" you chose to implement the code the
 * way you did is highly preferred.
 *
 * 1. syncAllNoLimit(): Make sure what is in the source database is 
 *    in our target database for all data in one sync. Think of a naive
 *    solution.
 * 2. syncAllSafely(): Make sure what is in the source database is in
 *    our target database for all data in batches during multiple
 *    syncs. Think of a pagination solution.
 * 3. syncNewChanges(): Make sure updates in the source database are in
 *    our target database without syncing all data for all time. Think
 *    of a delta change solution using operators.
 * 4. synchronize(): Create polling for the sync. If haven't synced before,
 *    full sync all records from the source database. Otherwise, a cadence
 *    where we check the source database for updates to sync.
 *
 * Assumptions:
 *
 * Assume that you only have read-only access to the sourceDb and write-only 
 * access to the targetDb. Of course, for tests, you can go outside these 
 * assumptions to properly test; however, for the general logic, assume this
 * level of access.
 *
 * Feel free to use any libraries that you are comfortable with and
 * change the parameters and returns to solve for the requirements.
 *
 * Reach out to rspoone@mediafly.com for clarity and general questions.
 *
 * You will need to reference the following API documentation:
 * 
 * Required: https://www.npmjs.com/package/nedb
 * Recommended: https://lodash.com/docs/4.17.15
 * Recommended: https://www.npmjs.com/package/await-the#api-reference
 */

const Datastore = require('nedb-promises');
const _ = require('lodash');
const the = require('await-the');

// The source database to sync updates from.
const sourceDb = new Datastore({
    inMemoryOnly: true,
    timestampData: true
});

// The target database that sendEvents() will write too.
const targetDb = new Datastore({
    inMemoryOnly: true,
    timestampData: true
});

let TOTAL_RECORDS;
let EVENTS_SENT = 0;


/**
 * Mock function to load data into the sourceDb.
 */
const load = async () => {
    // Add some documents to the collection.
    // TODO: Maybe dynamically do this? `faker` might be a good library here.
    await sourceDb.insert({ name: 'GE', owner: 'test', amount: 1000000 });
    await the.wait(300);
    await sourceDb.insert({ name: 'Exxon', owner: 'test2', amount: 5000000 });
    await the.wait(300);
    await sourceDb.insert({ name: 'Google', owner: 'test3', amount: 5000001 });

    TOTAL_RECORDS = 3;
}


/**
 * Mock function to find and update an existing document in the
 * sourceDb.
 */
const touch = async name => {
    await sourceDb.update({ name }, { $set: { owner: 'test4' } });
};


/**
 * API to send each document to in order to sync.
 */
const sendEvent = data => {
    EVENTS_SENT += 1;
    console.log('event being sent: ');
    console.log(data);

    // TODO: Write data to targetDb
    // await targetDb.insert(data);
};


/**
 * Utility to log one record to the console for debugging.
 */
const read = async name => {
    const record = await sourceDb.findOne({ name });
    console.log(record);
};


/**
 * Get all records out of the database and send them to the targetDb.
 */
const syncAllNoLimit = async () => {
    // TODO
    const mySourceData = await sourceDb.find()
    await targetDb.insert(mySourceData)
}


/**
 * Sync up to the provided limit of records.
 */

// I am using cursor based pagination, basically because with it we can increase our performance due to how it's works
// Queries  in the database that use a cursor instead of offset pagination, has a better performance, 
// because the WHERE clause helps skip unwanted rows, while OFFSET needs to iterate over them, and the results is a full-table scan
const syncWithLimit = async (limit, data) => {

    let cursor = (!!data.nextCursor) ? data.nextCursor : null
    let mySourceDataPaginated
    if (cursor) {
        mySourceDataPaginated = await sourceDb.find({
            _id: {
                $lte: cursor
            }
        })
        
    } else {
        mySourceDataPaginated = await sourceDb.find({})
            .sort({_id: -1})
            .limit(limit + 1)
    }
    const hasMore = mySourceDataPaginated.length === limit + 1
    let nextCursor = null
    if (hasMore) {
        const nextCursorRecord = mySourceDataPaginated[limit]
        nextCursor = nextCursorRecord._id
        mySourceDataPaginated.pop()
    }
    await targetDb.insert(mySourceDataPaginated)

    data.hasMore = hasMore
    data.nextCursor = nextCursor
    
    return data;
}


/**
 * Synchronize all records in batches.
 */
const syncAllSafely = async (batchSize, data) => {
    // FIXME: Example implementation.
    if (_.isNil(data)) {
        data = {}
    }

    data.hasMore = true;
    await the.while(
        () => data.hasMore,
        async () => await syncWithLimit(batchSize, data)
    );

    return data;
}


/**
 * Sync changes since the last time the function was called with
 * with the passed in data.
 */

// Here we have alternatives ways to do this. 
// 1- Now we are using a function to check after an amount of time if some document was changed in a period of time,
// and then if something new comes up we sync we the target database.
// 2- Another alternative to do it, is building a change stream event to detect events and react immediately after some actions happend
// 3- Using triggers to react to database events
const syncNewChanges = async data => {
    // TODO
    const dateDecreasedObj = getTimeDecreasedByMlS(3000)

    const docsChanged = await sourceDb.find({
        updatedAt:{
            $gt: dateDecreasedObj
        }
    })
    if (docsChanged.length === 0) {
        console.log("Nothing to update");
        return data
    }
    for (const iterator of docsChanged) {
        //Case update doc
        let wasUpdated = await targetDb.update({_id: iterator._id}, iterator)
        //Case new doc
        if (wasUpdated === 0) {
            await targetDb.insert(iterator)
        }
        //If we have a case that there was a deleted documents we should see 
        //another way to do it, at least that the deletion was made logically

    }

    return data;
}

const getTimeDecreasedByMlS = (mlsToDecrease) => {
    const currentDateObj = new Date();
    const numberOfMlSeconds = currentDateObj.getTime();
    const addMlSeconds = mlsToDecrease;

    return new Date(numberOfMlSeconds - addMlSeconds);
}


/**
 * Implement function to fully sync of the database and then 
 * keep polling for changes.
 */
const synchronize = async () => {
    // TODO
    await load();
    const sourceDocs = await sourceDb.find({})
    const targetDocs = await targetDb.find({})

    // Case: has never been updated before
    if (sourceDocs.length > 0 && targetDocs.length === 0 ) {
        
        // await syncAllNoLimit();

        //To syncronize dbs using batches
        await syncAllSafely(2);
    }else{
        await the.wait(3000);
        await touch('GE');
        await read('GE');
        await syncNewChanges()
    }
    
}



/**
 * Simple test construct to use while building up the functions
 * that will be needed for synchronize().
 */
const runTest = async () => {
    await load();

    // Check what the saved data looks like.
    await read('GE');

    EVENTS_SENT = 0;
    await syncAllNoLimit();

    
    // TODO: Maybe use something other than logs to validate use cases?
    // Something like `mocha` with `assert` or `chai` might be good libraries here.
    if (EVENTS_SENT === TOTAL_RECORDS) {
        console.log('1. synchronized correct number of events')
    }

    EVENTS_SENT = 0;
    const data = await syncAllSafely(2);

    if (EVENTS_SENT === TOTAL_RECORDS) {
        console.log('2. synchronized correct number of events')
    }
    // Make some updates and then sync just the changed files.
    EVENTS_SENT = 0;
    await the.wait(300);
    await touch('GE');
    await syncNewChanges(1, data);

    if (EVENTS_SENT === 1) {
        console.log('3. synchronized correct number of events')
    }
}

// TODO:
// Call synchronize() instead of runTest() when you have synchronize working
// or add it to runTest().
// runTest();
synchronize();