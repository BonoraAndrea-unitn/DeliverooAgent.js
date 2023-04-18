import { timer, DeliverooApi } from "../lib/deliverooClient/index.js";
import { add_belief, set_goal, compute_plan, get_belief, get_goal, remove_goal, init_communication, execute_plan } from "./planning.js"

const HOST = 'http://localhost:8080'
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjM4OWE1MDhmMjAyIiwibmFtZSI6InJhbmRvbV9hZ2VudF8yIiwiaWF0IjoxNjgxMzA5NDY2fQ.IjVBhXFcj_mmHbHEsX8ZzCsaX7lyXoCP26hxGoW3pXw'

const NAME = 'random_agent_2'
const FREE_CELLS = 1
const BLOCKED_CELLS = 0

var x = -1, y = -1
var n = 0

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
        if(Math.floor(Math.random() * 20) == 19){ //Every move, 5% probability of switching plan 
            change_goal(n++)            
        }
    }
}

function change_goal(n) {
    if (n%2 == 0) {
        remove_goal('in r c51')
        set_goal('in r c75')
    } else {
        remove_goal('in r c75')
        set_goal('in r c51')
    }
}

async function loop() {

    var tmp_plan = null
    await timer(1000)
    change_goal(n++)

    while (true) {
        
        await timer(300);
        console.log("GOAL: " + get_goal())
        tmp_plan = await compute_plan()

        if (tmp_plan) {
            try{ 
                var status = await execute_plan(tmp_plan) 
                change_goal(n++)
                await timer(4000);
            }
            catch(e){ }
        }        
    }
}

init_communication(client)
init_belief_set()
loop()

client.on('you', me => set_position(Math.floor(me['x']), Math.floor(me['y']))) // [ {}, {id, x, y, score}]
