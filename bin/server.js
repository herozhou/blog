var { exec } = require('child_process');

var path = require('path')

const chalk = require('chalk');
const log = console.log;


module.exports = function (option,package_name){

    var proc =  exec("hugo server --theme=even --buildDrafts",(error, stdout, stderr) => {
        log(chalk.red('exec error:',error));
        log(chalk.red('exec error:',stderr));
        log(chalk.green('stdout:',stdout));
    });
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', function (chunk) {
        log(chalk.green(chunk))
    });
    proc.stderr.on('data', (data) => {
        log(chalk.red(data.toString()));
    });


}
