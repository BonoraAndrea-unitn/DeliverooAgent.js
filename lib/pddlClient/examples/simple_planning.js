import { onlineSolve, PddlDomain, PddlAction, PddlExecutor, PddlProblem, Planner, Beliefset} from "../index.js";

Planner.doPlan = onlineSolve;


class LightOn extends PddlAction {

    name = 'LightOn'
    parameters = 'l'
    precondition = [ 'switched-off l' ]
    effect = [ 'switched-on l', 'not switched-off l' ]

    async exec (...args) {
        apply_changes(this.parameters, args, this.effect)
        console.log( 'LightOn', ...args )
    }

}

class Prova extends PddlAction {

    name = 'Prova'
    parameters = 'l c'
    precondition = [ 'switched-on l', 'turn-off c' ]
    effect = [ 'turn-on c', 'not turn-off c' ]

    async exec (...args) {
        apply_changes(this.parameters, args, this.effect)
        console.log( 'Prova', ...args )
    }

}

function apply_changes(parameters, args, effect){
    parameters = parameters.split(" ")
    for(let e of effect){
        for(let i = 0; i < parameters.length; i++){
            e = e.replace(parameters[i], args[i])
        }
        add_belief(e)
    }
}

export function add_belief(belief) {
    if (belief.split(' ')[0] != 'not')
        myBeliefset.declare(belief)
    else
        myBeliefset.undeclare(belief.substring(4, belief.length))
    pddlProblem.addObject(...myBeliefset.objects) //'a', 'b'
    pddlProblem.addInit(...myBeliefset.entries.filter(([fact, value]) => value).map(([fact, value]) => fact))//(...beliefs.literals)
}

const lightOn = new LightOn();
const prova = new Prova();

const myBeliefset = new Beliefset()
myBeliefset.declare( 'switched-off light1' )
myBeliefset.declare( 'turn-off cable1')

const myGoal = [ 'turn-on cable1' ]

 const myPlanner = new Planner( lightOn );

// myPlanner.planAndExec(myBeliefset, myGoal);
// myPlanner.plan( myBeliefset, myGoal )
// .then( plan => myPlanner.exec( plan ) );


var pddlDomain = new PddlDomain( 'lights', lightOn, prova )

var pddlProblem = new PddlProblem()
pddlProblem.addObject(...myBeliefset.objects) //'a', 'b'
pddlProblem.addInit(...myBeliefset.entries.filter( ([fact,value])=>value ).map( ([fact,value])=>fact ))//(...beliefs.literals)
pddlProblem.addGoal(...myGoal)

var plan = await onlineSolve(pddlDomain, pddlProblem);

//console.log(lightOn.toString())
console.log(myBeliefset.entries)

var executor = new PddlExecutor(lightOn, prova)
await executor.exec(plan)

console.log("\npiano eseguito\n")
console.log(myBeliefset.entries)