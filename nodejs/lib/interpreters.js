'use strict';

/*
	Language -> shell command mapping for the /run API. Each entry is a
	template with a ${code_in_base64} placeholder that the runner decodes and
	executes. Mirrors the frontend interpreter map so callers can pass a
	`language` instead of hand-building the echo|base64 wrapper.
*/
const interpreters = {
	'sh': 'echo "${code_in_base64}" | base64 --decode | bash',
	'bash': 'echo "${code_in_base64}" | base64 --decode | bash',
	'python': 'echo "${code_in_base64}" | base64 --decode | python3',
	'python3': 'echo "${code_in_base64}" | base64 --decode | python3',
	'javascript': 'echo "${code_in_base64}" | base64 --decode | node',
	'node': 'echo "${code_in_base64}" | base64 --decode | node',
	'c': 'echo "${code_in_base64}" | base64 --decode | gcc -xc -o run1 - && ./run1',
	'c_ccp': 'echo "${code_in_base64}" | base64 --decode | gcc -xc -o run1 - && ./run1',
	'c++': 'echo "${code_in_base64}" | base64 --decode | g++ -xc++ -o run1 - && ./run1',
	'c_cpp': 'echo "${code_in_base64}" | base64 --decode | g++ -xc++ -o run1 - && ./run1',
	'php': 'echo "${code_in_base64}" | base64 --decode | php',
	'powershell': 'echo "${code_in_base64}" | base64 --decode | pwsh -NonInteractive',
	'lua': 'echo "${code_in_base64}" | base64 --decode | lua',
	'markdown': 'echo "${code_in_base64}" | base64 --decode | pandoc -f markdown -t html',
	'rust': 'echo "${code_in_base64}" | base64 --decode | rustc -o run1 - && ./run1',
	'perl': 'echo "${code_in_base64}" | base64 --decode | perl',
	'brainfuck': 'echo "${code_in_base64}" | base64 --decode > /tmp/br.run; bf /tmp/br.run',
	'golang': 'echo "${code_in_base64}" | base64 --decode > /tmp/run.go; go run /tmp/run.go',
	'go': 'echo "${code_in_base64}" | base64 --decode > /tmp/run.go; go run /tmp/run.go',
	'java': 'echo "${code_in_base64}" | base64 --decode > /tmp/code.java; java /tmp/code.java',
	'ruby': 'echo "${code_in_base64}" | base64 --decode | ruby',
	'typescript': 'echo "${code_in_base64}" | base64 --decode | ts-node',
	'csharp': 'echo "${code_in_base64}" | base64 --decode > /tmp/code.cs; mcs /tmp/code.cs -out:/tmp/code.exe; mono /tmp/code.exe',
	'swift': 'echo "${code_in_base64}" | base64 --decode | swift',
	'r': 'echo "${code_in_base64}" | base64 --decode | R --no-save',
	'scala': 'echo "${code_in_base64}" | base64 --decode > /tmp/code.scala; scala -i /tmp/code.scala',
	'haskell': 'echo "${code_in_base64}" | base64 --decode | runhaskell',
	'groovy': 'export JAVA_HOME=/usr/lib/jvm/java-11-openjdk-amd64; echo "${code_in_base64}" | base64 --decode > /tmp/code.groovy; groovy -d /tmp/code.groovy',
	'fortran': 'echo "${code_in_base64}" | base64 --decode > /tmp/code.f; gfortran -o /tmp/code /tmp/code.f && ./tmp/code',
	'solidity': 'echo "${code_in_base64}" | base64 --decode > /tmp/main.sol; solc --allow-paths /usr/bin/ --assemble --overwrite /tmp/main.sol',
};

/*
	Resolve a language name to its bash_line. Throws a 400 error if unknown.
*/
function getBashLine(language){
	const line = interpreters[language];
	if(!line){
		const error = new Error('UnknownLanguage');
		error.name = 'UnknownLanguage';
		error.message = `Unknown language "${language}". Supported: ${Object.keys(interpreters).join(', ')}`;
		error.status = 400;
		throw error;
	}
	return line;
}

module.exports = {interpreters, getBashLine};
