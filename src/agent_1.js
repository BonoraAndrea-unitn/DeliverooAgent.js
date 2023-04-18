import { timer, DeliverooApi } from "../lib/deliverooClient/index.js";
import { add_belief, set_goal, compute_plan, get_belief, get_goal, remove_goal, init_communication, execute_plan } from "./planning.js"

var x = -1, y = -1

const FREE_CELLS = 1
const BLOCKED_CELLS = 0
const HOST = 'http://localhost:8080'
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjJiOWE3ZGZhNTU3IiwibmFtZSI6ImMiLCJpYXQiOjE2Nzk5MTExNjZ9.tYBrcUOEievZ7jcjxjf7btVh9EjioQk7t02pu3Qo6Ko'

const db_to_collect = new Map()
const db_selected = new Map()
var mutex = false
var executing_plan = false
var carried_points = 0
var number_carried_parcels = 0
var new_parcels = false

const map = [
    [1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 1, 1, 1, 1],
    [1, 0, 0, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 0, 1],
    [1, 0, 0, 1, 1, 0, 1],
    [1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1],
]

const client = new DeliverooApi(HOST, TOKEN)

client.on("connect", () => {
    console.log("socket connect", client.socket.id); // x8WIv7-mJelg7on_ALbxc
});

client.on("disconnect", () => {
    console.log("socket disconnect", client.socket.id); // x8WIv7-mJelg7on_ALbxc
});

function init_belief_set() {
    add_belief('robot r')
    for (let j = 0; j < map.length; j++) {
        for (let i = 0; i < map[j].length; i++) {
            if (map[i][j] == FREE_CELLS)
                add_belief('free c' + (i + 1) + '' + (j + 1))
            if (i != map.length - 1) {
                add_belief('connected c' + (i + 1) + (j + 1) + ' c' + (i + 2) + (j + 1))
                add_belief('connected c' + (i + 2) + (j + 1) + ' c' + (i + 1) + (j + 1))
            }
            if (j != map[i].length - 1) {
                add_belief('connected c' + (i + 1) + (j + 1) + ' c' + (i + 1) + (j + 2))
                add_belief('connected c' + (i + 1) + (j + 2) + ' c' + (i + 1) + (j + 1))
            }
        }
    }
}

function set_position(new_x, new_y) {
    if (new_x != x || new_y != y) {
        if ((x == -1 || y == -1)) {
            console.log("set position -> " + 'in r c' + (new_x + 1) + '' + (new_y + 1))
            add_belief('in r c' + (new_x + 1) + '' + (new_y + 1))
        }
        x = new_x + 1
        y = new_y + 1
    }
}

async function replan(goal_location, str = 'pick') {

    var status = false
    console.log("Try to replan")
    if (executing_plan)
        return false

    executing_plan = true
    console.log('Setting goal -> in r c' + (goal_location.x + 1) + (goal_location.y + 1))
    set_goal('in r c' + (goal_location.x + 1) + (goal_location.y + 1))
    let tmp_plan = await compute_plan()

    if (tmp_plan) {
        await execute_plan(tmp_plan)
        remove_goal('in r c' + (goal_location.x + 1) + (goal_location.y + 1))
        status = true
        if (str == "drop")
            await client.putdown();
        else
            await client.pickup();
        await timer(100);
    }


    executing_plan = false

    return status
}

async function update_parcels(parcels) {
    console.log(parcels)
    for (const p of parcels) {
        if (!p.carriedBy) {
            if (!db_to_collect.has(p.id) || !db_selected.has(p.id)) {
                db_to_collect.set(p.id, [])
            }
            if (db_to_collect.has(p.id)) {
                const history = db_to_collect.get(p.id)
                let last = history[history.length - 1]
                if (!last || last.x != p.x || last.y != p.y) {
                    add_belief('parcel ' + p.id)
                    add_belief('in ' + p.id + ' c' + (p.x + 1) + (p.y + 1))
                    history.push({ x: p.x, y: p.y, reward: p.reward })
                    new_parcels = true
                }
            }
        }
    }
}

function add_to_carried_db(location) {
    for (const p of db_to_collect) {
        console.log(p[1][p[1].length - 1].x, location.x, p[1][p[1].length - 1].y, location.y, p[1][p[1].length - 1].x == location.x && p[1][p[1].length - 1].y == location.y)
        if (p[1][p[1].length - 1].x == location.x && p[1][p[1].length - 1].y == location.y) {
            const key = p[0]
            const location = p[1][p[1].length - 1]
            if (!db_selected.has(key)) {
                db_selected.set(key, [])
            }
            else {
                const history = db_selected.get(key)
                let last = history[history.length - 1]
                if (!last || last.x != location.x || last.y != location.y) {
                    history.push({ x: location.x, y: location.y })
                }
            }
            console.log("Points earned", location.reward)
            carried_points = carried_points + location.reward
            number_carried_parcels++
            console.log("After update")
            console.log(carried_points, location.reward)
            console.log(number_carried_parcels)
            db_to_collect.delete(key)
        }
    }

}

async function pick(parcel) {
    console.log("VADO VERSO UNA PARCEL")
    const key = parcel.p[0]
    const location = parcel.p[1][parcel.p[1].length - 1]
    if (!executing_plan) {
        const status = await replan(location, 'pick')
        if (status) {
            //db_to_collect.delete(key)
            add_to_carried_db(location)
        }
    }
}

async function drop(deposit_tile) {
    console.log("VADO A DEPOSITARE")
    if (!executing_plan) {
        const status = await replan(deposit_tile.dl, 'drop')
        if (status) {
            number_carried_parcels = 0
            carried_points = 0
        }
    }
}

async function loop2() {

    await timer(100)

    while (true) {
        console.log("My points: ", carried_points)
        console.log("Number of carried parcels: ", number_carried_parcels)
        const parcel = nearest_parcel()
        const deposit_tile = nearest_drop_location()

        if (parcel.p && deposit_tile) {
            if (carried_points == 0 || pick_or_drop(parcel, deposit_tile)) {
                await pick(parcel)
            }
            else {
                await drop(deposit_tile)
            }
        }
        else if (!parcel.p && carried_points > 0)
            await drop(deposit_tile)
        else {
            //GO IN THE MIDDLE (FOR NOW)
            await replan({ x: 3, y: 2 }, 'pick')
        }

        await timer(1000)
    }
}

function pick_or_drop(parcel, deposit_tile) {
    //pick -> return true
    //drop -> return false
    console.log("PICK OR DROP?")
    const parcel_values = parcel.p[1][parcel.p[1].length - 1]

    //Andare a prendere la parcel + depositarla nel posto più vicino
    var point_to_parcel = parcel_values.reward - parcel.distance + carried_points - number_carried_parcels * parcel.distance
        - (number_carried_parcels + 1) * nearest_drop_location(parcel_values.y, parcel_values.x).distance


    var point_to_deposit = carried_points - number_carried_parcels * deposit_tile.distance


    console.log(point_to_parcel, point_to_deposit)

    return point_to_parcel > point_to_deposit
}

function nearest_parcel() {
    var nearest_p = null
    var nearest_distance = 1000
    var best = 0
    for (const p of db_to_collect) {
        const distance = manhattan_distance(p[1][p[1].length - 1])
        const tmp_best = p[1][p[1].length - 1].reward - distance
        if (best < tmp_best) {
            nearest_p = p
            nearest_distance = distance
            best = tmp_best
        }
    }
    return { p: nearest_p, distance: nearest_distance }
}

function nearest_drop_location(y_dist = y, x_dist = x) {
    var nearest_dl = null
    var nearest_distance = 1000
    for (let i = 0; i < map.length; i++) {
        if (i != 0 && i != map.length - 1) {
            const d1 = manhattan_distance({ x: i, y: 0 })
            const d2 = manhattan_distance({ x: i, y: map[i].length - 1 })
            if (d1 < nearest_distance && map[i][0] == FREE_CELLS) {
                nearest_dl = { x: i, y: 0 }
                nearest_distance = d1
            }
            if (d2 < nearest_distance && map[i][map[i].length - 1] == FREE_CELLS) {
                nearest_dl = { x: i, y: map[i].length - 1 }
                nearest_distance = d2
            }
        } else {
            for (let j = 0; j < map[i].length; j++) {
                const distance = manhattan_distance({ x: i, y: j }, y_dist, x_dist)
                if (distance < nearest_distance && map[i][j] == FREE_CELLS) {
                    nearest_dl = { x: i, y: j }
                    nearest_distance = distance
                }
            }
        }
    }
    return { dl: nearest_dl, distance: nearest_distance }
}

function manhattan_distance(p, y_dist = y, x_dist = x) {
    return Math.abs(p.y + 1 - y_dist) + Math.abs(p.x + 1 - x_dist)
}

async function loop() {

    const known_parcels = [
        { id: 'p0', x: 6, y: 2, carriedBy: null, reward: 20 },
        { id: 'p1', x: 6, y: 3, carriedBy: null, reward: 35 },
        { id: 'p2', x: 1, y: 0, carriedBy: null, reward: 23 }
    ]

    var tmp_plan = null
    var smt_new = false
    var to_collect = []
    await timer(1000)

    for (const p of known_parcels) {
        add_belief('parcel '+p.id)
        add_belief('in ' + p.id + ' c' + (p.x + 1) + (p.y + 1))
        set_goal('picked r ' + p.id)
        to_collect.push(p[0])
    }
    set_goal('in r c17')

    while (true) {

        await timer(300);
        console.log("GOAL: " + get_goal())
        tmp_plan = await compute_plan()

        if (tmp_plan) {
            await execute_plan(tmp_plan)
            for (var p of to_collect)
                db_to_collect.delete(p)
            tmp_plan = null
        }


        //const p = nearest_parcel()
        /*for( const p of db_to_collect){
            set_goal('picked r ' + p[0])
            to_collect.push(p[0])
            smt_new = true
        }
        if(smt_new){
            console.log("Qualcosa di nuovo")
            console.log("GOAL: "+ get_goal())
            tmp_plan = await compute_plan()
        }
        else {
            console.log("Niente di nuovo")
        }

        if (tmp_plan) {
            await execute_plan(tmp_plan)
            for(var p of to_collect)
                db_to_collect.delete(p)
            tmp_plan = null
        }*/
    }
}

init_communication(client)
init_belief_set()
loop()

client.socket.on('parcels sensing', pp => update_parcels(pp)) // [ {}, {id, x, y, carriedBy, reward}]
client.on('you', me => set_position(Math.floor(me['x']), Math.floor(me['y']))) // [ {}, {id, x, y, score}]
client.on('agents sensing', aa => console.log(aa)) // [ {}, {id, x, y, score}]
