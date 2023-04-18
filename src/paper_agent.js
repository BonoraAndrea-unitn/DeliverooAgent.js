import { timer, DeliverooApi } from "../lib/deliverooClient/index.js";
import { add_belief, set_goal, compute_plan, get_belief, get_goal, remove_goal, init_communication, execute_plan, stop_plan, reset_goal } from "./planning_extension.js"

const HOST = 'http://localhost:8080'
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjIxZjViMDBkODE5IiwibmFtZSI6InBhcGVyX2FnZW50IiwiaWF0IjoxNjgwNTMxMjA4fQ.anLzOrp7tKapW2B3ra4pWrOgzClKofGZrEqtmJvr80g'

const NAME = 'paper_agent'
const SEEN_ZONE = 5
const FREE_CELLS = 1
const BLOCKED_CELLS = 0
const DEPOSIT_TILE = 'c77'
const KNOWN_PARCELS = [
    { id: 'p3', x: 2, y: 0, carriedBy: null },
    { id: 'p4', x: 0, y: 4, carriedBy: null },
    { id: 'p5', x: 5, y: 2, carriedBy: null }
]

var init_completed = 0
var x = -1, y = -1
var other_agent = { x: -1, y: -1 }
var exploration_cell = null
var temporary_blocked_cells = []
const db_to_collect = new Map()
const db_other_agent = new Map()

const db_agents = new Map()

const map = [
    [1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 1, 1, 1, 1],
    [1, 0, 0, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 0, 1],
    [1, 0, 0, 1, 1, 0, 1],
    [1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1],
]

var heat_map = [
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
]

var seen_map = [
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
]

var risk_factors = [
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
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
    if (Math.floor(new_x) != (x - 1) || Math.floor(new_y) != (y - 1)) { //New position
        if ((x == -1 || y == -1)) { //Spawned
            console.log("set position -> " + 'in r c' + (new_x + 1) + '' + (new_y + 1))
            add_belief('in r c' + (new_x + 1) + '' + (new_y + 1))
            x = Math.floor(new_x) + 1
            y = Math.floor(new_y) + 1
        }
        else { //Move done
            x = Math.floor(new_x) + 1
            y = Math.floor(new_y) + 1
            update_heat_map()
            update_seen_map()
            update_risk_factors()
        }

    }
}

function update_heat_map() {
    for (const a of db_agents) {
        let history = a[1][a[1].length - 1]
        heat_map[history.x][history.y]++
    }
}

function update_seen_map() {
    for (var i = 0; i < map.length; i++) {
        for (var j = 0; j < map[i].length; j++) {
            const distance = Math.abs(i - x + 1) + Math.abs(j - y + 1)
            if (distance < SEEN_ZONE) {
                seen_map[i][j]++
            }
        }
    }
}

function update_risk_factors() {
    for (var i = 0; i < heat_map.length; i++) {
        for (var j = 0; j < heat_map[i].length; j++) {
            if (seen_map[i][j] != 0)
                risk_factors[i][j] = heat_map[i][j] / seen_map[i][j]
        }
    }
}

function update_agents_position(agents) {
    for (const a of agents) {
        if (!db_agents.has(a.id)) { //Non presente nel db
            db_agents.set(a.id, [])
        }
        const history = db_agents.get(a.id)
        let last = history[history.length - 1]
        if (!last || last.x != Math.floor(a.x) || last.y != Math.floor(a.y)) { //Presente ma era in una posizione diversa
            history.push({ id: a.id, name: a.name, x: Math.floor(a.x), y: Math.floor(a.y) })
        }
    }

    for (const a of db_agents) {
        var trovato = false
        for (const b of agents) {
            if (a[0] == b.id)
                trovato = true
        }
        if (!trovato)
            db_agents.delete(a[0])
    }
}

async function update_parcels(parcels) {

    var new_parcels = false
    if (init_completed == 1) {
        for (const p of parcels) {
            if (p.type == 'paper' && !p.carriedBy) {
                if (!db_to_collect.has(p.id)) {
                    db_to_collect.set(p.id, [])
                }
                const history = db_to_collect.get(p.id)
                let last = history[history.length - 1]
                if (!last || last.x != p.x || last.y != p.y) {
                    if (!last)
                        add_belief('parcel ' + p.id)
                    else if (last.x != p.x || last.y != p.y)
                        add_belief('not in ' + p.id + ' c' + (last.x + 1) + (last.y + 1))
                    add_belief('in ' + p.id + ' c' + (p.x + 1) + (p.y + 1))
                    history.push({ id: p.id, x: p.x, y: p.y })
                    new_parcels = true
                }
            }
            if (p.type == 'paper' && !p.carriedBy) {
                if (!db_other_agent.has(p.id)) {
                    db_other_agent.set(p.id, [])
                }
                const history = db_other_agent.get(p.id)
                let last = history[history.length - 1]
                if (!last || last.x != p.x || last.y != p.y) {
                    history.push({ id: p.id, x: p.x, y: p.y })
                }
            }
        }
        if (new_parcels) {
            console.log("New parcel! Stopping plan.")
            update_goal()
            stop_plan()
        }
    }
}

function update_goal(tmp_plan = null) {

    if(exploration_cell){
        remove_goal('in r ' + exploration_cell)
        exploration_cell = null
    }

    if (get_goal() != '(and )') {
        if (!tmp_plan) {
            for (const p of db_to_collect) {
                if (!get_goal().includes("picked r " + p[0])) {
                    set_goal("picked r " + p[0])
                }
            }
        } else {
            for (const a of tmp_plan) {
                if (a.action == "pick_up") {
                    remove_goal('picked r ' + a.args[2])
                    db_to_collect.delete(a.args[2])
                }
            }
        }
    }
}

function split_plan(plan, action) {
    if (!plan)
        return null

    var splitted_plan = []
    splitted_plan.push([])
    var i = 0;
    for (const a of plan) {
        splitted_plan[i].push(a)
        if (a.action == action) {
            i++;
            splitted_plan.push([])
        }
    }
    return splitted_plan
}

async function compute_plan_risk(plan) {
    var risk = plan.length
    var risky_cell = null
    var max_cell_risk = -1

    for (const a of plan) {
        if (a.action == 'move' && a != plan[plan.length - 2]) {
            var x = a.args[2].charAt(1) - 1
            var y = a.args[2].charAt(2) - 1

            if (risk_factors[x][y] > max_cell_risk) {
                max_cell_risk = risk_factors[x][y]
                risky_cell = 'c' + (x + 1) + (y + 1)
            }

            //Considera cella bloccata e calcola piano alternativo
            if (risk_factors[x][y] != 0) {
                add_belief('not free c' + (x + 1) + (y + 1))
                var cell_alternative_plan = await compute_plan(false)
                if (!cell_alternative_plan)
                    cell_alternative_plan = Array(100)
                else
                    cell_alternative_plan = split_plan(cell_alternative_plan, 'pick_up')[0]
                add_belief('free c' + (x + 1) + (y + 1))

                risk += risk_factors[x][y] * cell_alternative_plan.length
            }
        }
    }

    return { risk: risk, risky_cell: risky_cell }
}

async function compute_better_plan(n_plans = 3) {

    console.log("Computing best plan...")
    var plan
    var min_risk = 10000
    var better_plan = null

    for (var i = 0; i < n_plans; i++) {

        var plan = await compute_plan(false)

        if (plan) {
            plan = split_plan(plan, 'pick_up')[0]
            const risk_object = await compute_plan_risk(plan)
            console.log("Plan ", i + 1, "/", n_plans, " computed, risk = ", risk_object.risk)
            if (min_risk > risk_object.risk) {
                min_risk = risk_object.risk
                better_plan = plan
            }
            if (risk_object.risk == plan.length || risk_object.risky_cell == null)
                break
            temporary_blocked_cells.push(risk_object.risky_cell)
            add_belief('not free ' + risk_object.risky_cell)
        }
        else {
            break
        }
    }

    empty_blocked_cells()

    console.log(better_plan)

    return better_plan
}

function empty_blocked_cells() {
    while (temporary_blocked_cells.length != 0) {
        add_belief('free ' + temporary_blocked_cells.pop())
    }
}

async function work_with_moving_obstacles() {

    var tmp_plan = null
    var to_collect = []
    add_belief('not carrying r')
    await timer(1000)

    add_belief('deposit_tile ' + DEPOSIT_TILE)
    for (const p of KNOWN_PARCELS) {
        add_belief('parcel ' + p.id)
        add_belief('in ' + p.id + ' c' + (p.x + 1) + (p.y + 1))
        set_goal('picked r ' + p.id)
        to_collect.push(p.id)
        db_to_collect.set(p.id, [])
        db_to_collect.get(p.id).push({ id: p.id, x: p.x, y: p.y })
    }
    //set_goal('in r c17')
    set_goal('package_free r')
    await timer(300);
    init_completed = 1

    var tmp_belief = null;

    while (true) {
        while (true) {
            console.log(get_goal())
            console.log(risk_factors)
            tmp_plan = await compute_better_plan(3) 
            if (tmp_belief)
                add_belief(tmp_belief)
            if (tmp_plan) {
                try {
                    let status = await execute_plan(tmp_plan)
                    if (status) {
                        update_goal(tmp_plan)
                        tmp_belief = null
                    }
                } catch (e) {
                    console.log(e)
                    tmp_belief = 'free ' + e.args[2]
                    add_belief('not free ' + e.args[2])
                }
            }
            else {
                break
            }
            tmp_plan = null
        }

        //esplora
        //Seleziona cella random
        do {
            var random_x = Math.floor(Math.random() * 7);
            var random_y = Math.floor(Math.random() * 7);
            console.log(random_x, random_y, map[random_x][random_y])
        } while (map[random_x][random_y] != 1)
        exploration_cell = 'c'+(random_x + 1) + (random_y + 1)
        set_goal("in r " + exploration_cell)

    }
}

async function loop2() {

    set_goal('in r c77')
    await timer(500);
    console.log("My position is ", x, y)

    while (true) {
        var plan = await compute_better_plan(3)
        if (plan) {
            try {
                await execute_plan(plan)
            } catch (e) {
                console.log(e)
            }
        }
    }

}

init_communication(client)
init_belief_set()
//work_with_moving_obstacles()
loop2()


client.socket.on('parcels sensing', pp => update_parcels(pp)) // [ {}, {id, x, y, carriedBy, reward}]
client.on('you', me => set_position(Math.floor(me['x']), Math.floor(me['y']))) // [ {}, {id, x, y, score}]
client.socket.on('agents sensing', aa => update_agents_position(aa)) // [ {}, {id, x, y, score}]
