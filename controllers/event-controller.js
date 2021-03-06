/**
 * EVENT CONTROLLER
 * 
 * Contains the routes for handling all event related controls
 * This includes the following
 * 
 * - CREATE a new event
 * - UPDATE and existing event (details)
 * 
 * - REGISTER an user for an event
 * 
 * - GET all registered events for a user
 * 
 * - GET all registrations for an organizer's event
 * 
 * - SEND notifications to the registered user from the organizer
 * 
 * - Handle payments (!!!)
 * 
 * 
 */

const express = require('express');
const { Response, ERR_CODE } = require('../helpers/response-helper');
const router = express.Router();
const { conn } = require('../config');
const { eventValidator } = require('../validators');
const validator = require('express-validation');
const { updateVersion } = require('../middleware');
const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");
const testFolder = '../../images/instagram/habba19';
const fs = require('fs');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://habba19x.firebaseio.com"
});


/**
 * NEW EVENT
 * 
 * fields: {
 *  name, description, rules, venue, date, fee
 * }
 * headers: {
 *  organizer_id
 * }
 * 
 * Add a new event under the requesting organizer
 * 
 */
router.post('/new', [validator(eventValidator.newEvent), updateVersion], async (req, res) => {
    const {
        name,
        description,
        rules,
        venue,
        date,
        fee,
        category_id
    } = req.body;
    const {
        organizer_id
    } = req.headers;

    const stmt1 = 'SELECT COUNT(*) AS count FROM EVENT WHERE organizer_id = ?';
    const stmt2 = 'INSERT INTO EVENT (name, description, rules, venue, date, fee, organizer_id, category_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';

    /**
     * One organizer can only organize one event. Hence the check
     */
    try {
        const results = await conn.query(stmt1, [organizer_id]);
        if (results[0]['count'] !== 0) throw new Error('event already registered'); // Check if organizer already has an event registered
    } catch (e) {
        console.log(e);
        res.send(new Response().withError(ERR_CODE.INVALID_USR));
        return;
    }

    try {
        await conn.query(stmt2, [name, description, rules, venue, date, fee, organizer_id, category_id]);
        res.send(new Response().noError())
    } catch (e) {
        console.log(e)
        res.send(new Response().withError(ERR_CODE.DB_WRITE))
    }
});

/**
 * GET DETAILS
 * headers {
 *  organizer_id
 * }
 * 
 * Returns the details of the event being organized by the requesting organizer
 * Also returns the details of the currently registered participants
 * For Events
 * 
 */
router.get('/details', validator(eventValidator.eventDetails), async (req, res) => {
    const {
        organizer_id
    } = req.headers;

    const stmt1 = '' +
        'SELECT E.*, C.name as category_name ' +
        'FROM EVENT as E ' +
        'INNER JOIN CATEGORY as C ' +
        'ON E.category_id = C.category_id ' +
        'WHERE organizer_id = ? ';

    const stmt2 = '' +
        'SELECT U.name, U.email, E.registration_time, U.college_name, U.phone_number ' +
        'FROM USER as U ' +
        'INNER JOIN EVENT_REG as E ' +
        'ON U.user_id = E.user_id ' +
        'INNER JOIN EVENT as EV ' +
        'ON E.event_id = EV.event_id ' +
        'WHERE EV.organizer_id = ?';


    try {
        const results = await conn.query(stmt1, [organizer_id]);
        if (typeof results[0] === 'undefined') {
            // The organizer has no event being organized by him currently
            res.send(new Response().withError(ERR_CODE.CREATE_EVENT));
            return;
        }
        const obj = {};
        obj.details = results[0];
        const results2 = await conn.query(stmt2, [organizer_id]);
        obj.eventRegistration = results2;
        res.send(new Response().withData(obj).noError());

    } catch (e) {
        console.log(e);
        res.send(new Response().withError(ERR_CODE.INVALID_USR));
    }

});

/**
 * UPDATE EVENT
 * 
 * fields: {
 *  name, description, rules, venue, date, fee
 * }
 * headers: {
 *  organizer_id
 * }
 * 
 * Update the existing event under the requesting organizer
 * 
 */
router.post('/update', [validator(eventValidator.newEvent), updateVersion], async (req, res) => {
    const {
        name,
        description,
        rules,
        venue,
        date,
        fee,
        category_id
    } = req.body;
    const {
        organizer_id
    } = req.headers;

    const stmt = 'UPDATE EVENT SET name = ?, description = ?, rules = ?, venue = ?, date = ?, fee = ?, category_id = ? WHERE organizer_id = ?';

    try {
        const result = await conn.query(stmt, [name, description, rules, venue, date, fee, category_id, organizer_id]);
        if (result.affectedRows !== 0) {
            res.send(new Response().noError());
            return;
        }
        // No event under the organizer
        res.send(new Response().withError(ERR_CODE.CREATE_EVENT));
    } catch (e) {
        console.log(e);
        res.send(new Response().withError(ERR_CODE.INVALID_USR))
    }
});

/**
 * REGISTER A USER TO AN EVENT
 * 
 * fields: {
 *  event_id
 * }
 * headers: {
 *  user_id
 * }
 * 
 * Register a user to an event
 */
router.post('/user/register', async (req, res) => {
    const {
        event_id,
        device_id
    } = req.body;
    const {
        user_id
    } = req.headers;
    const events = ['13', '14', '15', '16', '17', '18', '19', '43', '64', '65', '66'];
    const fevents = [];
    const stmt = 'INSERT INTO EVENT_REG (user_id, event_id, payment_made, registration_time) VALUES (?, ?, ?, ?)';
    const stmt1 = 'SELECT college_name as col FROM USER WHERE user_id = ?'
    const split = user_id.split("-");
    try {
        //check for faculty events
        if (fevents.includes(event_id)) {
            if (split[0] === 'ay') {
                const result = await conn.query(stmt1, user_id);
                if (result[0]['col'] === 'faculty') {
                    await conn.query(stmt, [user_id, event_id, 0, new Date()]);
                    const reslt = await admin.messaging().subscribeToTopic(device_id, event_id);
                    console.log(reslt);
                    res.send(new Response().noError());
                }
                else res.send(new Response().withError(ERR_CODE.INVALID_EVE1));
            }
            else res.send(new Response().withError(ERR_CODE.INVALID_EVE));
        }
        //check for acharya events
        else if (events.includes(event_id)) {
            if (split[0] === 'ay') {
                await conn.query(stmt, [user_id, event_id, 0, new Date()]);
                const result = await admin.messaging().subscribeToTopic(device_id, event_id)
                console.log(result);
                res.send(new Response().noError());
            }
            else res.send(new Response().withError(ERR_CODE.INVALID_EVE));
        }
        //normal events
        else if (!(events.includes(event_id))) {
            await conn.query(stmt, [user_id, event_id, 0, new Date()]);
            const result = await admin.messaging().subscribeToTopic(device_id, event_id)
            console.log(result);
            res.send(new Response().noError());
        }

    } catch (e) {
        console.log(e);
        if (e.errno === 1062) {
            res.send(new Response().withError(ERR_CODE.ALREADY_REGISTERED));
            return;
        }
        if (e.errno === 1452) {
            res.send(new Response().withError(ERR_CODE.INVALID_USR));
            return;
        }
        res.send(new Response().withError(ERR_CODE.DB_WRITE));
    }

});

/**
 * USER DETAILS
 * 
 * headers: {
 *    user_id
 * }
 * Retrieve: 
 *  details of the requesting user
 *  details of the events they are registered to
 *  details of the workshops they are registered to
 *  notifications recieved for their event
 */
router.get('/user/details', validator(eventValidator.userDetails), async (req, res) => {
    const {
        user_id
    } = req.headers;

    const stmt1 = '' +
        'SELECT name, email, phone_number, college_name FROM USER WHERE user_id = ?';

    const stmt2 = '' +
        'SELECT EV.*,O.name as organizer_name, O.organizer_id, O.phone_number, O.email ' +
        'FROM EVENT as EV, EVENT_REG as E, USER as U ,ORGANIZER as O ' +
        'WHERE EV.event_id = E.event_id ' +
        'AND EV.organizer_id = O.organizer_id ' +
        'AND U.user_id = E.user_id ' +
        'AND E.user_id = ?';


    const stmt3 = '' +
        'SELECT WS.* ' +
        'FROM WORKSHOP as WS, WORKSHOP_REG as W, USER as U ' +
        'WHERE WS.workshop_id = W.workshop_id ' +
        'AND U.user_id = W.user_id ' +
        'AND W.user_id = ?';

    const stmt4 = '' +
        'SELECT N.title, N.message ' +
        'FROM NOTIFICATION as N ' +
        'INNER JOIN EVENT_REG as E ' +
        'ON N.event_id = E.event_id ' +
        'WHERE E.event_id IN ' +
        '(SELECT ER.event_id ' +
        'FROM EVENT_REG as ER ' +
        'WHERE ER.user_id = ?)';

    try {
        const results1 = await conn.query(stmt1, [user_id]);
        if (typeof results1[0] === 'undefined') {
            res.send(new Response().withError(ERR_CODE.INVALID_USR));
            return;
        }
        const obj = {};
        obj.details = results1[0];
        const results2 = await conn.query(stmt2, [user_id]);
        obj.eventsRegistered = results2;
        const results3 = await conn.query(stmt3, [user_id]);
        obj.workshopsRegistered = results3;
        const results4 = await conn.query(stmt4, [user_id]);
        obj.notifications = results4;
        res.send(new Response().withData(obj).noError());
    } catch (e) {
        console.log(e);
        res.send(new Response().withError(ERR_CODE.DB_READ));
    }
});

/**
 * NOTIFICATION
 * feilds: {
 *  title, message
 * }
 * headers: {
 *  organizer_id
 * }
 * Register a notification for the event under the requesting organizer and getting his/her event's ID.
 */

router.get('/organizer/auth', async (req, res) => {
    res.render('../views/notif_cred.ejs');
});

router.post('/organizer/auth', async (req, res) => {
    const { password } = req.body;
    if (password === process.env.MASTER_PASSWORD) {
        res.render('../views/event_notif.ejs');
    }
    else
        res.send(new Response().withError(ERR_CODE.INVALID_PWD));
});

router.post('/notification', validator(eventValidator.notification), async (req, res) => {
    const {
        title,
        message,
        organizer_id
    } = req.body;

    const stmt1 = 'SELECT event_id ' +
        'FROM EVENT ' +
        'WHERE organizer_id= ? ';
    const stmt2 = '' +
        'INSERT INTO NOTIFICATION (event_id, title, message, sent_date) VALUES (?,?,?,?) '


    try {
        const result = await conn.query(stmt1, [organizer_id]);
        const event_id = result[0].event_id;
        const topic = event_id;

        const nmessage = {
            notification: {
                title: title,
                body: message
            },
        };
        const nresult = await admin.messaging().sendToTopic(event_id.toString(), nmessage);
        await conn.query(stmt2, [event_id, title, message, new Date()]);
        res.send(new Response().noError());
    } catch (e) {
        console.log(e);
        res.send(new Response().withError(ERR_CODE.NOTIFICATION_FAILED));
    }
});

/**
 * MASTER FETCH
 * 
 * Get all categories, events and workshops in one request
 * 
 */
router.get('/masterfetch', async (req, res) => {

    const stmt1 = '' +
        'SELECT E.*, C.name as category_name, C.img_url as category_images, O.name as organizer_name, O.phone_number as organizer_phone ' +
        'FROM EVENT AS E, CATEGORY as C, ORGANIZER as O ' +
        'WHERE E.category_id = C.category_id ' +
        'AND E.organizer_id = O.organizer_id ' +
        'ORDER BY C.index ' +
        '';

    try {
        const result1 = await conn.query(stmt1);
        let arr = [];
        result1.forEach(row => {
            if (arr.findIndex(o => o.category_id === row.category_id) === -1)
                arr.push({
                    category_id: row.category_id,
                    category_name: row.category_name,
                    category_images: row.category_images,
                    events: []
                })
        })
        arr = arr.map(obj => {
            const eventsArr = result1.filter(o => o.category_id === obj.category_id);
            obj.events = [...eventsArr];
            return obj;
        })

        const obj = {};
        obj.mainEvents = arr;
        // IMPLEMENT WORKSHOPS
        obj.workshops = {};

        res.send(new Response().withData(obj).noError());
    } catch (e) {
        console.log(e);
        res.send(new Response().withError(ERR_CODE.DB_READ));
    }
});

/**
 * VERSION
 * 
 * Get the database version in the current state
 * 
 */
router.get('/version', async (req, res) => {
    const stmt = 'SELECT version FROM VERSION';

    try {
        const results = await conn.query(stmt);
        res.send(new Response().withData(results[0]).noError());
    } catch (e) {
        console.log(e);
        res.send(new Response().withError(ERR_CODE.DB_READ));
    }
})

router.post('/subgen', async (req, res) => {
    const { device_id } = req.body;
    try {
        const result = await admin.messaging().subscribeToTopic(device_id, 'ALL');
        console.log(result);
        res.send(new Response().noError());
    }
    catch (e) {
        console.log(e);
        res.send(new Response().withError(ERR_CODE.NOTIFICATION_FAILED));
    }
})


router.get('/notifs', async (req, res) => {
    res.render('../views/notif.ejs');

});

router.post('/notifs', async (req, res) => {
    const { password, title, message } = req.body;
    const nmessage = {
        notification: {
            title: title,
            body: message
        },
    };

    if (password === process.env.ADMIN_PASSWORD) {
        const nresult = await admin.messaging().sendToTopic('ALL', nmessage);
        res.send(nresult);
    }

    else
        res.send(new Response().withError(ERR_CODE.INVALID_PWD));

});
router.get('/instapics', (req, res) => {
    var resFile = [];
    fs.readdir(testFolder, (err, files) => {
        files.forEach(file => {

            if (file == null) {
                res.send(new Response().withError(ERR_CODE.PICTURES_NOTFOUND));
            }
            if (file.endsWith('.jpg')) {
                resFile.push(file);
            }
        });
        res.send(new Response().withData(resFile).noError());
    });
})

router.get('/organizer_details', async (req, res) => {

    const stmt = '' +
        'SELECT E.event_id, E.name as event_name , O.organizer_id , O.name as organizer_name , phone_number , email ' +
        'FROM EVENT as E ' +
        'INNER JOIN ORGANIZER as O ' +
        'ON E.organizer_id = O.organizer_id ';
    try {
        const result = await conn.query(stmt);
        res.render('../views/organizer_details.ejs', { organizer: result });
    }
    catch (err) {
        console.log(err)
        res.send(new Response().withError(ERR_CODE.DB_READ));
    }

});


router.get('/update_organizer/:id', async (req, res) => {
    const id = req.params.id + '';
    const stmt = 'SELECT * FROM ORGANIZER WHERE organizer_id = ?';
    try {
        const result = await conn.query(stmt, [id]);
        res.render('../views/update_organizer.ejs', { organizer: result });
    }
    catch (err) {
        console.log(err)
        res.send(new Response().withError(ERR_CODE.DB_READ));
    }

});

router.post('/update_organizer/:id', async (req, res) => {
    const id = req.params.id + '';
    const { name, phone_number, email, password, master_password } = req.body;
    const stmt = 'UPDATE ORGANIZER SET name = ?, phone_number = ?, email = ?, password = ? WHERE organizer_id = ?';
    if (master_password === process.env.MASTER_PASSWORD) {
        const result = await conn.query(stmt, [name, phone_number, email, password, id]);
        res.send(new Response().noError());
    }
    else {
        res.send(new Response().withError(ERR_CODE.DB_WRITE));
    }

});

router.get('/event_cred', async (req, res) => {
    res.render('../views/event_cred.ejs');

});
router.post('/event_details', async (req, res) => {

    const { event_id } = req.body;
    const stmt = '' +
        'SELECT U.name as u_name, U.phone_number as phone_number, U.college_name, U.department_name, U.email ' +
        'FROM USER as U, EVENT_REG as ER ' +
        'WHERE U.user_id = ER.user_id ' +
        'AND ER.event_id = ?';
    const stmt1 = 'SELECT * FROM EVENT WHERE event_id = ?'
    try {
        const result = await conn.query(stmt, [event_id]);
        const result1 = await conn.query(stmt1, [event_id]);
        res.render('../views/event_details.ejs', { event: result, event_name: result1 });
    }
    catch (err) {
        console.log(err)
        res.send(new Response().withError(ERR_CODE.DB_READ));
    }

});

router.get('/list', async (req, res) => {
    res.render('../views/list.ejs');

});
router.post('/list', async (req, res) => {

    const { college, dept } = req.body;
    let stmt = '' +
        'SELECT U.name,email,phone_number,college_name,department_name,E.name as e_name ' +
        'FROM USER as U ' +
        'INNER JOIN EVENT_REG as ER ' +
        'ON U.user_id = ER.user_id ' +
        'INNER JOIN EVENT as E ' +
        'ON E.event_id = ER.event_id ' +
        'WHERE U.user_id IN ' +
        '(SELECT ER.user_id ' +
        'FROM EVENT_REG as ER) ' +
        'AND college_name = ?';
    if (dept !== '')
        stmt = stmt + 'AND department_name = ?';
    try {
        if (dept !== '') {
            const result = await conn.query(stmt, [college, dept]);
            res.render('../views/list.ejs', { event: result });
        }
        else {
            const result1 = await conn.query(stmt, [college]);
            res.render('../views/list.ejs', { event: result1 });
        }
    }
    catch (err) {
        console.log(err)
        res.send(new Response().withError(ERR_CODE.DB_READ));
    }

});
router.get('/sports_list', async (req, res) => {
    res.render('../views/sports_list.ejs');

});


router.post('/sports_list', async (req, res) => {
    const { team } = req.body;
    const split = team.split('-');
    let stmt = '' +
        'SELECT U.name,email,phone_number,college_name,department_name,E.name as e_name ' +
        'FROM USER as U ' +
        'INNER JOIN EVENT_REG as ER ' +
        'ON U.user_id = ER.user_id ' +
        'INNER JOIN EVENT as E ' +
        'ON E.event_id = ER.event_id ' +
        'WHERE U.user_id IN ' +
        '(SELECT ER.user_id ' +
        'FROM EVENT_REG as ER) ' +
        'AND ER.event_id IN (72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86) ';

    if (team === 'BA-AB-BC-BS-BF-MC-MP-MM-MA-MJ-MF') {
        stmt = stmt + 'AND college_name IN (?)';
    }
    else if (team === 'BV-PG-DN-BN-PC') {
        stmt = stmt + 'AND college_name IN (?)';
    }
    else if (team === 'DE') {
        stmt = stmt + 'AND college_name IN (?)';
    }
    else {
        stmt = stmt + 'AND department_name IN (?)';
    }
    try {
        const result = await conn.query(stmt, [split]);
        res.render('../views/sports_list.ejs', { event: result });
    }
    catch (err) {
        console.log(err)
        res.send(new Response().withError(ERR_CODE.DB_READ));
    }

});


module.exports = router;

