import { timer, DeliverooApi } from "../lib/deliverooClient/index.js";
import { add_belief, set_goal, compute_plan, get_belief, get_goal, remove_goal, init_communication, execute_plan, stop_plan, reset_goal } from "./planning_extension.js"

const HOST = 'http://localhost:8080'
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjFmODAxMGNmY2NiIiwibmFtZSI6InBsYXN0aWNfYWdlbnQiLCJpYXQiOjE2ODA1MjcxNzZ9.xGF3-tvBkUkJ265r2c65oghHHgXbS1Q_jjQFRqcYTNI'

const NAME = 'plastic_agent'
const SEEN_ZONE = 5
const FREE_CELLS = 1
const BLOCKED_CELLS = 0
const DEPOSIT_TILE = 'c17'
const OTHER_AGENT_DEPOSIT_TILE = 'c77'
const KNOWN_PARCELS = [
    { id: 'p0', x: 6, y: 2, carriedBy: null, type: 'plastic' },
    { id: 'p1', x: 6, y: 3, carriedBy: null, type: 'plastic' },
    { id: 'p2', x: 1, y: 0, carriedBy: null, type: 'plastic' }
]

var init_completed = 0
var x = -1, y = -1
var other_agent = { x: -1, y: -1, has_parcels: false }
var exploration_cell = null
var seeing_agent = false
const db_to_collect = new Map()
const db_other_agent = new Map()

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
    add_belief('robot r', 2)
    for (let j = 0; j < map.length; j++) {
        for (let i = 0; i < map[j].length; i++) {
            if (map[i][j] == FREE_CELLS){
                add_belief('free c' + (i + 1) + '' + (j + 1))
                add_belief('free c' + (i + 1) + '' + (j + 1), 2)
            }
            if (i != map.length - 1) {
                add_belief('connected c' + (i + 1) + (j + 1) + ' c' + (i + 2) + (j + 1))
                add_belief('connected c' + (i + 2) + (j + 1) + ' c' + (i + 1) + (j + 1))
                add_belief('connected c' + (i + 1) + (j + 1) + ' c' + (i + 2) + (j + 1), 2)
                add_belief('connected c' + (i + 2) + (j + 1) + ' c' + (i + 1) + (j + 1), 2)
            }
            if (j != map[i].length - 1) {
                add_belief('connected c' + (i + 1) + (j + 1) + ' c' + (i + 1) + (j + 2))
                add_belief('connected c' + (i + 1) + (j + 2) + ' c' + (i + 1) + (j + 1))
                add_belief('connected c' + (i + 1) + (j + 1) + ' c' + (i + 1) + (j + 2), 2)
                add_belief('connected c' + (i + 1) + (j + 2) + ' c' + (i + 1) + (j + 1), 2)
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
        }

    }
}

function update_agent_position(agent) {
    if (other_agent.x != Math.floor(agent.x) || other_agent.y != Math.floor(agent.y)) {
        console.log("UPDATE OTHER AGENT POSITION")
        add_belief('not in r c' + other_agent.x + other_agent.y, 2)
        other_agent.x = Math.floor(agent.x) + 1
        other_agent.y = Math.floor(agent.y) + 1
        add_belief('in r c' + other_agent.x + other_agent.y, 2)
    }
    if (agent.length != 0) {
        seeing_agent = true
        if (db_other_agent.size > 0) {
            stop_plan()
        }
    }
}

async function update_parcels(parcels) {

    var new_parcels = false
    var new_paper_parcels = false
    other_agent.has_parcels = false

    if (init_completed == 1) {
        for (const p of parcels) {
            if (p.type == 'plastic' && !p.carriedBy) {
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
            if (p.type == 'paper') {
                if (seeing_agent && p.carriedBy != null) {
                    other_agent.has_parcels = true
                }
                else{
                    add_belief('package_free r', 2)
                }
                if (!db_other_agent.has(p.id)) {
                    db_other_agent.set(p.id, [])
                }
                const history = db_other_agent.get(p.id)
                let last = history[history.length - 1]
                if (!last || last.x != p.x || last.y != p.y) {
                    if (!last){
                        add_belief('parcel ' + p.id, 2)
                        new_paper_parcels = true
                    }
                    else if (last.x != p.x || last.y != p.y)
                        add_belief('not in ' + p.id + ' c' + (last.x + 1) + (last.y + 1), 2)
                    add_belief('in ' + p.id + ' c' + (p.x + 1) + (p.y + 1), 2)
                    history.push({ id: p.id, x: p.x, y: p.y })
                }
            }
        }
        if (new_parcels) {
            console.log("New parcel! Stopping plan.")
            update_goal()
            stop_plan()
        }
        if(new_paper_parcels){
            for(const p of db_other_agent){
                console.log("New paper parcels!")
                //DO SOMETHING
            }
        }
    }
}

function update_goal(tmp_plan = null) {

    if (exploration_cell) {
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


async function compute_better_plan() {
    //DO SOMETHING
    let other_parcels = (db_other_agent.size > 0)
    var plan, other_plan
    plan = await compute_plan(false)
    reset_goal(2)
    if (plan)
        plan = split_plan(plan, 'pick_up')[0]

    if (!seeing_agent || (!other_agent.has_parcels && !other_parcels)) {
        return plan
    }

    else if (other_parcels) {
        //CALCOLO PIANO PER ANDARE A RACCOGLIERE E CERCO DI EVITARLO
        for (const p of db_other_agent) {
            console.log('picked r ' + p[1][p[1].length-1].id)
            set_goal('picked r ' + p[1][p[1].length-1].id, 2)
        }
    }

    else {
        //CALCOLO PIANO PER IL DEPOSITO E CERCO DI EVITARLO
        set_goal('package_free r', 2)
    }
    
    console.log(get_belief(2).entries.filter(([fact, value]) => value).map(([fact, value]) => fact).includes("package_free r"))
    console.log(get_belief(2).entries.filter(([fact, value]) => value).map(([fact, value]) => fact).includes("in r c"+other_agent.x+other_agent.y))
    console.log("BELIEF AGENT 2:", get_belief(2).entries.filter(([fact, value]) => value).map(([fact, value]) => fact))
    console.log("GOAL AGENT 2: ", get_goal(2))
    var other_plan = await compute_plan(false, 2)
    console.log(other_plan)
    if (other_plan){
        other_plan = split_plan(other_plan, 'pick_up')[0]
        plan = await confronta_piani(plan, other_plan)
    }

    //CONFRONTA PIANI
    
    return plan
}

async function confronta_piani(plan1, plan2) {

    var collision
    var collision_cells = []

    do {
        collision = false
        for (var i = 0; i < Math.min(plan1.length, plan2.length); i++) {
            var c1, c2
            if (plan1[i].action == 'move')
                c1 = plan1[i].args[2]
            else
                c1 = plan1[i].args[1]

            if (plan2[i].action == 'move')
                c2 = plan2[i].args[2]
            else
                c2 = plan2[i].args[1]

            if ((plan1[i].action == 'move' || plan2[i].action == 'move') && c1 == c2) {
                //SCONTRO!!!
                collision = true
                collision_cells.push(c1)
                break
            }
        }

        add_belief("not free " + c1)
        let tmp_plan = await compute_plan(false)
        if (tmp_plan)
            plan1 = split_plan(tmp_plan, 'pick_up')[0]

    } while (collision);

    for(var i = 0; i < collision_cells.length; i++)
        add_belief('free' + collision_cells[i])

    return plan1;
}

async function work_with_other_agent() {

    var tmp_plan = null
    var to_collect = []
    add_belief('not carrying r')
    await timer(1000)

    add_belief('deposit_tile ' + DEPOSIT_TILE)
    add_belief('deposit_tile ' + OTHER_AGENT_DEPOSIT_TILE, 2)

    for (const p of KNOWN_PARCELS) {
        add_belief('parcel ' + p.id)
        add_belief('in ' + p.id + ' c' + (p.x + 1) + (p.y + 1))
        set_goal('picked r ' + p.id)
        to_collect.push(p.id)
        db_to_collect.set(p.id, [])
        db_to_collect.get(p.id).push({ id: p.id, x: p.x, y: p.y })
    }

    set_goal('package_free r')
    await timer(300);
    init_completed = 1

    var tmp_belief = null;

    while (true) {
        while (true) {
            console.log(get_goal())
            tmp_plan = await compute_better_plan()
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
        } while (map[random_x][random_y] != 1)
        exploration_cell = 'c' + (random_x + 1) + (random_y + 1)
        set_goal("in r " + exploration_cell)

    }
}

init_communication(client)
init_belief_set()
work_with_other_agent()

client.socket.on('parcels sensing', pp => update_parcels(pp)) // [ {}, {id, x, y, carriedBy, reward}]
client.on('you', me => set_position(Math.floor(me['x']), Math.floor(me['y']))) // [ {}, {id, x, y, score}]
client.socket.on('agents sensing', aa => update_agent_position(aa)) // [ {}, {id, x, y, score}]
