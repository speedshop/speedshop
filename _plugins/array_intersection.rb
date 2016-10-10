module Jekyll
  module ArrayIntersectionFilter
    def intersect var, args
      a = var.is_a?(Array) ? var : var.to_s.split(',').map(&:strip)
      b = args.is_a?(Array) ? args : args.to_s.split(',').map(&:strip)
      a & b
    end

    def intersection var, args
      intersect(var, args).size != 0
    end
  end
end

Liquid::Template.register_filter(Jekyll::ArrayIntersectionFilter)
