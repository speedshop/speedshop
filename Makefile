all: jekyll pandoc llms

jekyll:
	bundle exec jekyll build

pandoc:
	bundle exec ruby _pandoc/pandoc.rb

llms:
	bundle exec ruby _pandoc/llms_txt.rb

clean:
	rm -rf _site
