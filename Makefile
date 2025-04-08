all: jekyll pandoc

jekyll:
	bundle exec jekyll build

pandoc:
	bundle exec ruby _pandoc/pandoc.rb

clean:
	rm -rf _site
