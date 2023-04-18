import fs from 'fs';



export default class PddlProblem {

    static nextId = 0;

    constructor(name = '', objects = [], inits = [], goals = []) {
        this.name = 'd' + PddlProblem.nextId++ + name

        this.objects = objects
        this.objects.toPddlString = () => {
            return this.objects.join(' ')
        }

        this.inits = inits
        this.inits.toPddlString = () => {
            return this.inits.map(e => '(' + e + ')').join(' ')
        }

        this.goals = goals
        this.goals.toPddlString = () => {
            return '(and ' + this.goals.map(e => '(' + e + ')').join(' ') + ')'
        }
    }

    addObject(...object) {
        this.objects = object
        this.objects.toPddlString = () => {
            return this.objects.join(' ')
        }
    }

    addInit(...init) {
        this.inits = init
        this.inits.toPddlString = () => {
            return this.inits.map(e => '(' + e + ')').join(' ')
        }
    }

    addGoal(...goal) {
        this.goals.push(...goal)
    }

    removeGoal(...goal) {
        const index = this.goals.indexOf(...goal);
        if (index > -1) { // only splice array when item is found
            this.goals.splice(index, 1); // 2nd parameter means remove one item only
        }
    }

    resetGoal(){
        this.goals = []
        this.goals.toPddlString = () => {
            return '(and ' + this.goals.map(e => '(' + e + ')').join(' ') + ')'
        }
    }

    saveToFile() {
        var path = './tmp/problem-' + this.name + '.pddl'

        return new Promise((res, rej) => {

            fs.writeFile(path, this.content, err => {
                if (err)
                    rej(err)
                else // console.log("File written successfully");
                    res(path)
            })

        })

    }

    get content() {
        return `\
;; problem file: problem-${this.name}.pddl
(define (problem default)
    (:domain default)
    (:objects ${this.objects.toPddlString()})
	(:init ${this.inits.toPddlString()})
	(:goal ${this.goals.toPddlString()})
)
`
    }

}



// var lightProblem = new PddlProblem('lights')
// lightProblem.addObject(...['light1', 'light2'], 'light3')
// lightProblem.addInit('switched-off light1', 'switched-off light2')
// lightProblem.addGoal('switched-on light1')
// lightProblem.saveToFile()

