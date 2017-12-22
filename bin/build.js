const { exec } = require('child_process');

var path = require('path')

const chalk = require('chalk');
const log = console.log;

let execCommand = function(command,console_content,option) {
  return new Promise((resolve, reject) => {
	var proc =	exec(command, option||{},(error, stdout, stderr) => {
		// console.log(`Current directory: ${process.cwd()}`);
		
		if (error && stderr) {
			log(chalk.red('exec error:',error));
			reject(new Error(error));
			return;
		}
		// log(chalk.yellow(stdout));
		log(chalk.green(console_content));
		
		resolve(console_content);
	});
	proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', function (chunk) {

        log(chalk.yellow(chunk))
    });
    proc.stderr.on('data', (data) => {

        log(chalk.red(data.toString()));
    });
  });
 };

module.exports = function (option,package_name){

// blog
// process.chdir(path.resolve(__dirname,'..'))

const blogoption = {
	encoding: 'utf8',
	timeout: 0,
	maxBuffer: 200 * 1024,
	killSignal: 'SIGTERM',
	cwd: './',
	env: null
};
const publicoption = {
	encoding: 'utf8',
	timeout: 0,
	maxBuffer: 200 * 1024,
	killSignal: 'SIGTERM',
	cwd: './public',
	env: null
};
execCommand('hugo --theme=even --baseUrl="http://blog.herozhou.com"','静态资源打包成功，准备上传blog到Github')
.then(
	() => execCommand('git add .','blog: git add 添加文件成功'),
	err => log(chalk.red("静态资源打包 失败", err))

)
.then(
	() => execCommand('git commit -m "Update" ','blog: git commit 成功'),
	err => log(chalk.red("'blog: git add 失败'", err))

)
.then(
  	() => execCommand('git push origin master','blog: git push master 成功,准备进入public目录'),
  	err => log(chalk.red("blog: git commit 失败 ", err))
)
.then(
	() => execCommand('git add .','public: git add 添加文件成功',publicoption),
	err => log(chalk.red("public: git push master  失败: ", err))
)
.then(
	() => execCommand('git commit -m "Update" ','public: git commit 成功',publicoption),
	err => log(chalk.red("public: git add 添加文件失败: ", err))
).then(
	() => execCommand('git push origin gh-pages','public: git push gh-pages 成功,',publicoption),
	err => log(chalk.red("public: git commit 失败: ", err))
)
.then(
	  () => log(chalk.green('打包并提交Github成功')),
	  err => log(chalk.red("public: git push gh-pages 失败 ", err))
)


}
