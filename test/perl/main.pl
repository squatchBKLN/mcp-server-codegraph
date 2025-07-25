#!/usr/bin/perl

use strict;
use warnings;
use Utils;
use MyModule::Utils;

my $processor = MyModule::Utils->new();
my $data = "hello world";

# Object method call
my $result = $processor->process_data([$data]);

# Class method call  
my $helper_result = Utils->helper_function($data);

# Function call to imported module
export_data($result);

print "Results: $result, $helper_result\n";
