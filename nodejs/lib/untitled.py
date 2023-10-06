word = 'hello world'
lines = 20
print(*[
	'{}{}{}'.format(
		' '*l,
		''.join([word[i%len(word)] for i in range(lines-l)]),
		''.join([word[(i+(lines-l))%len(word)] for i in range(lines-l)]) 
	) for l in range(lines)][::-1],
	 sep='\n')

print(*[
	'{}{}{}'.format(
		' '*l,
		''.join([word[i%len(word)] for i in range(lines-l)]),
		''.join([word[(i+(lines-l))%len(word)] for i in range(lines-l)]) )
	for l in range(lines)
	][1:]
	, sep='\n')


```
```<@745387617239040001> like this?

```


function generate_random_data(size) {
    return new Blob([new ArrayBuffer(size)], {type: 'application/octet-stream'});
};

console.log((await generate_random_data(2048)).text())

