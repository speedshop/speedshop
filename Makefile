all: jekyll purge pandoc

jekyll:
	bundle exec jekyll build

purge:
	npx purgecss --css _site/assets/css/app.css --content _site/*.html _site/**/*.html _site/**/**/**/*.html -o ./_site/assets/css

pandoc:
	bundle exec ruby _pandoc/pandoc.rb

clean:
	rm -rf _site