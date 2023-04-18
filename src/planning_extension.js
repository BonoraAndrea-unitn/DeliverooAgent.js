import { timer } from "../lib/deliverooClient/index.js";
import { onlineSolve, PddlDomain, PddlAction, PddlExecutor, PddlProblem, Planner, Beliefset } from "../lib/pddlClient/index.js";

Planner.doPlan = onlineSolve;
var client = null

//Define possible actions

class Move extends PddlAction {

    name = 'move'
    parameters = 'agent from to'
    precondition = ['robot agent', 'in agent from', 'connected from to', 'free to']
    effect = ['not in agent from', 'free from', 'not free to', 'in agent to']

    async exec(...args) {
        let status = await client.move(get_direction(args[1], args[2]))
        if (!status) {
            throw 'move failed'
        }
        else {
            apply_changes(this.parameters, args, this.effect)
            console.log('move up', ...args)
        }
        await timer(1000);
    }

}

class Pick_up extends PddlAction {

    name = "pick_up"
    parameters = 'agent from parcel'
    precondition = ['robot agent', 'parcel parcel', 'in agent from', 'in parcel from']
    effect = ['picked agent parcel', 'not in parcel from', 'not package_free agent']

    async exec(...args) {
        let status = await client.pickup()
        apply_changes(this.parameters, args, this.effect)
        console.log('picking up', ...args)
        await timer(100)
    }

}

class Put_down extends PddlAction {

    name = 'put_down'
    parameters = 'agent from'
    precondition = ['robot agent', 'in agent from', 'deposit_tile from', 'not package_free agent']
    effect = ['package_free agent']

    async exec(...args) {
        let status = await client.putdown()
        apply_changes(this.parameters, args, this.effect)
        console.log('putting down', ...args)
        await timer(100)
    }

}

const move = new Move()
const pick_up = new Pick_up()
const put_down = new Put_down()

//Define goal and belief set
const myBeliefset = new Beliefset()
const otherBeliefset = new Beliefset()

//Define PDDL domain and problem
var pddlDomain = new PddlDomain('movs', move, pick_up, put_down)
var pddlProblem = new PddlProblem()
var pddlExecutor = new PddlExecutor(move, pick_up, put_down)
var otherPddlDomain = new PddlDomain('movs', move, pick_up, put_down)
var otherPddlProblem = new PddlProblem()
var myGoal = []
var otherGoal = []


export function init_communication(c) {
    client = c
}

export function add_belief(belief, who = 1) {

    if (who == 1) {
        if (belief.split(' ')[0] != 'not') {
            myBeliefset.declare(belief)
        }
        else
            myBeliefset.undeclare(belief.substring(4, belief.length))

        pddlProblem.addObject(...myBeliefset.objects) //'a', 'b'
        pddlProblem.addInit(...myBeliefset.entries.filter(([fact, value]) => value).map(([fact, value]) => fact))//(...beliefs.literals)
    }
    else {
        if (belief.split(' ')[0] != 'not') {
            otherBeliefset.declare(belief)
        }
        else
            otherBeliefset.undeclare(belief.substring(4, belief.length))

        otherPddlProblem.addObject(...otherBeliefset.objects) //'a', 'b'
        otherPddlProblem.addInit(...otherBeliefset.entries.filter(([fact, value]) => value).map(([fact, value]) => fact))//(...beliefs.literals)
    }
}

export function get_belief(who = 1) {
    if (who == 1)
        return myBeliefset;
    else
        return otherBeliefset;
}

export function set_goal(goal, who = 1) {
    if (who == 1) {
        myGoal = [goal]
        pddlProblem.addGoal(...myGoal)
    }
    else {
        otherGoal = [goal]
        otherPddlProblem.addGoal(...otherGoal)
    }
}

export function remove_goal(goal, who=1) {
    if (who == 1) {
        myGoal = [goal]
        pddlProblem.removeGoal(...myGoal)
    } else {
        otherGoal = [goal]
        otherPddlProblem.removeGoal(...otherGoal)
    }
}

export async function compute_plan(print = true, who = 1) {
    var plan = null;
    try {
        if (who == 1)
            plan = await onlineSolve(pddlDomain, pddlProblem, print);
        else
            plan = await onlineSolve(otherPddlDomain, otherPddlProblem, print);
    } catch (error) {
        console.error("Plan not found!")
    }
    return plan;
}

export async function execute_plan(plan) {
    try {
        return await pddlExecutor.exec(plan)
    } catch (e) {
        console.log(e)
        console.log("Error in executing the plan during action " + e.action)
        throw e
    }
}

export function stop_plan() {
    pddlExecutor.stop_executing = true
}

export function get_goal(who = 1) {
    if (who == 1)
        return pddlProblem.goals.toPddlString()
    else
        return otherPddlProblem.goals.toPddlString()
}

export function reset_goal(who = 1) {
    if (who == 1)
        pddlProblem.resetGoal()
    else
        otherPddlProblem.resetGoal()
}

function apply_changes(parameters, args, effect) {
    parameters = parameters.split(" ")
    for (let e of effect) {
        for (let i = 0; i < parameters.length; i++) {
            e = e.replace(parameters[i], args[i])
        }
        add_belief(e)
    }
}

function get_direction(from, to) {
    //Assume map less than 10x10
    if (from[1] < to[1])
        return 'right'
    else if (from[1] > to[1])
        return 'left'
    else if (from[2] < to[2])
        return 'up'
    else
        return 'down'
}