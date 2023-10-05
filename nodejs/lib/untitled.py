word = 'hello world'
lines = 20
print(*['{}{}{}'.format(' '*l, ''.join([word[i%len(word)] for i in range(lines-l)]), ''.join([word[(i+(lines-l))%len(word)] for i in range(lines-l)]) ) for l in range(lines)][::-1], sep='\n')
print(*[
	'{}{}{}'.format(
		' '*l,
		''.join([word[i%len(word)] for i in range(lines-l)]),
		''.join([word[(i+(lines-l))%len(word)] for i in range(lines-l)]) )
	for l in range(lines)
	][1:]
	, sep='\n')
